import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';
import matter from 'gray-matter';
import md5 from 'md5';
import { Embedder } from './embedder.js';
import { buildEmbeddingInputs, ChunkingOptions } from './chunking.js';
import { getSafeFilePath } from '../utils.js';

function chunkingOptionsFromEnv(): ChunkingOptions {
  const minRaw = Number(process.env.GEMINI_OBSIDIAN_MIN_CHUNK_CHARS ?? '40');
  const maxRaw = Number(process.env.GEMINI_OBSIDIAN_MAX_CHUNK_CHARS ?? '1800');
  const targetRaw = Number(process.env.GEMINI_OBSIDIAN_TARGET_CHUNK_CHARS ?? '700');
  const min = Number.isFinite(minRaw) && minRaw > 0 ? Math.floor(minRaw) : 40;
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 1800;
  const target = Number.isFinite(targetRaw) && targetRaw > min ? Math.floor(targetRaw) : 700;
  return { minChunkChars: min, maxChunkChars: max, targetChunkChars: target };
}

interface NoteChunk {
  id: string;
  path: string;
  text: string;
  vector: number[];
}

export class VaultIndexer {
  private db: lancedb.Connection | null = null;
  private currentDbPath: string | null = null;
  private lock: Promise<void> = Promise.resolve();

  constructor() {}

  private async acquireLock(): Promise<() => void> {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wait = this.lock;
    this.lock = nextLock;
    await wait;
    return release!;
  }

  public async reset() {
    const release = await this.acquireLock();
    try {
      this.db = null;
      this.currentDbPath = null;
    } finally {
      release();
    }
  }

  private validatePath(relativePath: string) {
    // Normalize path separators to forward slashes
    const normalized = relativePath.replace(/\\/g, '/');
    
    // Disallow path traversal (..)
    const segments = normalized.split('/');
    if (segments.some(s => s === '..')) {
      throw new Error(`Invalid file path (traversal): ${relativePath}`);
    }

    // Reject control characters and null bytes
    if (/[\x00-\x1F\x7F]/.test(normalized)) {
      throw new Error(`Invalid file path (control chars): ${relativePath}`);
    }

    return normalized;
  }

  private async getPaths(vaultPath: string, workspacePath?: string | null, vaultId?: string | null) {
    let baseStorePath: string;
    const resolvedVaultPath = path.resolve(vaultPath);
    
    // Sanitize vaultId if provided, only allowing safe alphanumeric characters/hex
    let vaultHash: string;
    if (vaultId) {
      if (!/^[a-zA-Z0-9_\-]+$/.test(vaultId)) {
        throw new Error(`Invalid vault_id: ${vaultId}. Only alphanumeric characters, underscores, and hyphens are allowed.`);
      }
      vaultHash = vaultId;
    } else {
      vaultHash = md5(resolvedVaultPath);
    }

    if (workspacePath) {
      baseStorePath = path.join(workspacePath, '.gemini-obsidian', 'vaults', vaultHash);
    } else {
      // Hashed Global Cache: ~/.gemini-obsidian/vaults/<hash_of_vault_path>
      baseStorePath = path.join(os.homedir(), '.gemini-obsidian', 'vaults', vaultHash);
    }

    const dbPath = path.join(baseStorePath, 'lancedb');
    const hashPath = path.join(baseStorePath, 'file-hashes.json');

    // Ensure the storage directory exists
    await fs.mkdir(baseStorePath, { recursive: true });
    
    return { dbPath, hashPath };
  }

  private async writeHashesAtomic(hashPath: string, hashes: Record<string, string>) {
    const tempPath = `${hashPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(hashes));
    await fs.rename(tempPath, hashPath);
  }

  private async getDb(vaultPath: string, workspacePath?: string | null, vaultId?: string | null) {
    const { dbPath } = await this.getPaths(vaultPath, workspacePath, vaultId);
    if (this.db && this.currentDbPath === dbPath) {
      return this.db;
    }
    this.db = await lancedb.connect(dbPath);
    this.currentDbPath = dbPath;
    return this.db;
  }

  private async getTable(vaultPath: string, workspacePath?: string | null, vaultId?: string | null) {
    const db = await this.getDb(vaultPath, workspacePath, vaultId);
    const tableNames = await db.tableNames();
    if (tableNames.includes('notes')) {
      return await db.openTable('notes');
    }
    return null;
  }

  public async indexFile(vaultPath: string, relativePath: string, workspacePath?: string | null, vaultId?: string | null) {
    const release = await this.acquireLock();
    try {
      const normalizedPath = this.validatePath(relativePath);
      const { hashPath } = await this.getPaths(vaultPath, workspacePath, vaultId);
      const embedder = Embedder.getInstance();
      const filePath = getSafeFilePath(vaultPath, relativePath);

      const content = await fs.readFile(filePath, 'utf-8');
      const contentHash = md5(content);
      const { content: body } = matter(content);

      const { textsToEmbed, chunkMetadata } = buildEmbeddingInputs(normalizedPath, body, chunkingOptionsFromEnv());

      // Load hashes to update
      let hashes: Record<string, string> = {};
      try {
          hashes = JSON.parse(await fs.readFile(hashPath, 'utf-8'));
      } catch { /* ignore */ }

      const db = await this.getDb(vaultPath, workspacePath, vaultId);
      const tableNames = await db.tableNames();

      if (textsToEmbed.length > 0) {
          const chunks = await this.embedWithFallback(embedder, textsToEmbed, chunkMetadata);
          if (chunks.length === 0) {
              return { success: false, message: `Failed to embed content for ${relativePath}.` };
          }
          const chunkRows = chunks as unknown as Record<string, unknown>[];

          if (!tableNames.includes('notes')) {
              await db.createTable('notes', chunkRows);
          } else {
              const table = await db.openTable('notes');
              // Delete old chunks for this file
              await table.delete(`path = '${normalizedPath.replace(/'/g, "''")}'`);
              await table.add(chunkRows);
          }
          
          hashes[normalizedPath] = contentHash;
          await this.writeHashesAtomic(hashPath, hashes);
          console.error(`Indexed ${chunks.length} chunks for ${relativePath}.`);
          return { success: true, chunks: chunks.length };
      } else {
          // No chunks: Remove from DB and hashes
          if (tableNames.includes('notes')) {
              const table = await db.openTable('notes');
              await table.delete(`path = '${normalizedPath.replace(/'/g, "''")}'`);
          }
          delete hashes[normalizedPath];
          await this.writeHashesAtomic(hashPath, hashes);
          return { success: true, chunks: 0, message: "File removed from index (no embeddable content)." };
      }
    } catch (err) {
      console.error(`Failed to index file ${relativePath}:`, err);
      return { success: false, message: String(err) };
    } finally {
      release();
    }
  }

  public async indexVault(vaultPath: string, force: boolean = false, workspacePath?: string | null, vaultId?: string | null) {
    const release = await this.acquireLock();
    try {
      const { hashPath } = await this.getPaths(vaultPath, workspacePath, vaultId);
      const embedder = Embedder.getInstance();
      const db = await this.getDb(vaultPath, workspacePath, vaultId);

      // Find all markdown files
      const files = await glob('**/*.md', { cwd: vaultPath, absolute: true });
      console.error(`Found ${files.length} notes in ${vaultPath}`);

      // Load previous file hashes for incremental indexing
      let previousHashes: Record<string, string> = {};
      if (!force) {
        try {
          const rawHashes = JSON.parse(await fs.readFile(hashPath, 'utf-8'));
          // Normalize keys to POSIX-style to handle cross-platform sync
          for (const key of Object.keys(rawHashes)) {
            previousHashes[key.replace(/\\/g, '/')] = rawHashes[key];
          }
        } catch { /* no previous hashes — will do full index */ }
      }

      const tableNames = await db.tableNames();
      const tableExists = tableNames.includes('notes');
      const hasPreviousHashes = Object.keys(previousHashes).length > 0;
      const canIncremental = tableExists && hasPreviousHashes && !force;

      const batchSizeRaw = Number(process.env.GEMINI_OBSIDIAN_EMBED_BATCH_SIZE ?? '48');
      const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.min(Math.floor(batchSizeRaw), 256) : 48;
      const useProgressBar = process.stderr.isTTY === true;
      const progressInterval = 100;

      // ── Phase 1: Read all files, compute hashes, build chunks for changed files ──
      const allTexts: string[] = [];
      const allMeta: { id: string; text: string; path: string }[] = [];
      const changedHashes: Record<string, string> = {}; // Hashes of files we are attempting to index
      const expectedChunkCounts: Record<string, number> = {}; // Expected total chunks per file
      const currentHashes: Record<string, string> = { ...previousHashes }; // Start with old hashes
      const changedPaths: string[] = [];
      let filesRead = 0;
      let skippedFiles = 0;

      const renderReadProgress = () => {
        if (files.length === 0) return;
        if (useProgressBar) {
          const percent = Math.min(100, Math.floor((filesRead / files.length) * 100));
          const width = 30;
          const filled = Math.round((percent / 100) * width);
          const bar = `${'='.repeat(filled)}${'-'.repeat(width - filled)}`;
          process.stderr.write(
            `\rReading [${bar}] ${percent}% ${filesRead}/${files.length} files`
          );
          if (filesRead === files.length) process.stderr.write('\n');
          return;
        }
        if (filesRead % progressInterval === 0 || filesRead === files.length) {
          console.error(`Reading progress: ${filesRead}/${files.length} files`);
        }
      };

      const FILE_READ_CONCURRENCY = 50;
      for (let i = 0; i < files.length; i += FILE_READ_CONCURRENCY) {
        const batch = files.slice(i, i + FILE_READ_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (filePath) => {
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              const relativePathRaw = path.relative(vaultPath, filePath);
              const relativePath = relativePathRaw.replace(/\\/g, '/');
              const contentHash = md5(content);

              // Skip unchanged files in incremental mode
              if (canIncremental && previousHashes[relativePath] === contentHash) {
                return null;
              }

              this.validatePath(relativePath);
              changedHashes[relativePath] = contentHash;
              changedPaths.push(relativePath);
              const { content: body } = matter(content);
              const inputs = buildEmbeddingInputs(relativePath, body, chunkingOptionsFromEnv());
              
              if (inputs.textsToEmbed.length > 0) {
                expectedChunkCounts[relativePath] = inputs.textsToEmbed.length;
                return inputs;
              } else {
                // File has no embeddable content (too short or empty)
                // Mark it as done immediately so we don't keep trying to index it
                currentHashes[relativePath] = contentHash;
                return null;
              }
            } catch (err) {
              console.error(`Failed to process file ${filePath}:`, err);
              return null;
            }
          })
        );

        for (const result of results) {
          if (result) {
            for (let j = 0; j < result.textsToEmbed.length; j++) {
              allTexts.push(result.textsToEmbed[j]);
              allMeta.push(result.chunkMetadata[j]);
            }
          } else {
            skippedFiles++;
          }
        }

        filesRead += batch.length;
        renderReadProgress();
      }

      // Determine deleted files (in previous hashes but not in current file set)
      const existingRelativePaths = new Set<string>();
      for (const f of files) {
        const p = path.relative(vaultPath, f).replace(/\\/g, '/');
        existingRelativePaths.add(p);
      }
      const deletedPaths = Object.keys(previousHashes).filter(p => !existingRelativePaths.has(p));

      if (canIncremental) {
        console.error(`Incremental: ${changedPaths.length} changed, ${deletedPaths.length} deleted, ${skippedFiles} unchanged`);
      } else {
        console.error(`Full index: ${allTexts.length} chunks from ${files.length} files`);
      }

      // Early exit: nothing changed
      if (canIncremental && allTexts.length === 0 && deletedPaths.length === 0) {
        console.error('Index is up to date, no changes detected.');
        await this.writeHashesAtomic(hashPath, currentHashes);
        return { success: true, chunks: 0, message: 'Index up to date, no changes detected.' };
      }

      if (!canIncremental && allTexts.length === 0) {
        return { success: false, message: "No content found to index." };
      }

      // ── Phase 2: Update index ─────────────────────────────────────────

      let indexedChunks = 0;
      let tableInitialized = false;
      let table: lancedb.Table | null = null;
      const persistedChunkCounts: Record<string, number> = {};

      // For incremental mode: delete old chunks for changed/deleted files, keep existing table
      if (canIncremental) {
        table = await db.openTable('notes');
        const pathsToDelete = [...changedPaths, ...deletedPaths];
        if (pathsToDelete.length > 0) {
          const DELETE_BATCH = 100;
          for (let i = 0; i < pathsToDelete.length; i += DELETE_BATCH) {
            const batch = pathsToDelete.slice(i, i + DELETE_BATCH);
            const escaped = batch.map(p => `'${p.replace(/'/g, "''")}'`);
            await table.delete(`path IN (${escaped.join(', ')})`);
          }
        }
        tableInitialized = true;
        for (const p of deletedPaths) delete currentHashes[p];
      } else {
          for (const k in currentHashes) delete currentHashes[k];
      }

      // Embed new/changed chunks (or all chunks for full reindex)
      if (allTexts.length > 0) {
        // Sort chunks by text length to reduce ONNX padding waste
        const sortedIndices = allTexts.map((_, i) => i);
        sortedIndices.sort((a, b) => allTexts[a].length - allTexts[b].length);
        const sortedTexts = sortedIndices.map(i => allTexts[i]);
        const sortedMeta = sortedIndices.map(i => allMeta[i]);

        let chunksEmbedded = 0;

        const renderEmbedProgress = () => {
          const total = sortedTexts.length;
          if (total === 0) return;
          if (useProgressBar) {
            const percent = Math.min(100, Math.floor((chunksEmbedded / total) * 100));
            const width = 30;
            const filled = Math.round((percent / 100) * width);
            const bar = `${'='.repeat(filled)}${'-'.repeat(width - filled)}`;
            process.stderr.write(
              `\rEmbedding [${bar}] ${percent}% ${chunksEmbedded}/${total} chunks`
            );
            if (chunksEmbedded === total) process.stderr.write('\n');
            return;
          }
          if (chunksEmbedded % (batchSize * 5) === 0 || chunksEmbedded === total) {
            console.error(`Embedding progress: ${chunksEmbedded}/${total} chunks`);
          }
        };

        const persistChunks = async (chunks: NoteChunk[]) => {
          if (chunks.length === 0) return;
          const chunkRows = chunks as unknown as Record<string, unknown>[];

          if (!tableInitialized) {
            try {
              await db.dropTable('notes');
            } catch (e) { /* ignore if not exists */ }
            table = await db.createTable('notes', chunkRows);
            tableInitialized = true;
          } else {
            if (!table) {
              table = await db.openTable('notes');
            }
            await table.add(chunkRows);
          }

          indexedChunks += chunks.length;
          
          for (const c of chunks) {
              const p = c.path;
              persistedChunkCounts[p] = (persistedChunkCounts[p] || 0) + 1;
              if (persistedChunkCounts[p] === expectedChunkCounts[p]) {
                  if (changedHashes[p]) {
                      currentHashes[p] = changedHashes[p];
                  }
              }
          }
        };

        // Accumulate ~5 embedding batches before writing to reduce per-write overhead
        const WRITE_ACCUMULATE = 5;
        let pendingChunks: NoteChunk[] = [];
        let batchesSinceWrite = 0;
        let pendingWrite: Promise<void> | null = null;

        for (let i = 0; i < sortedTexts.length; i += batchSize) {
          const batchTexts = sortedTexts.slice(i, i + batchSize);
          const batchMeta = sortedMeta.slice(i, i + batchSize);

          const embeddedChunks = await this.embedWithFallback(embedder, batchTexts, batchMeta);
          pendingChunks.push(...embeddedChunks);
          batchesSinceWrite++;
          chunksEmbedded += batchTexts.length;
          renderEmbedProgress();

          if (batchesSinceWrite >= WRITE_ACCUMULATE) {
            if (pendingWrite) await pendingWrite;
            const chunksToWrite = pendingChunks;
            pendingChunks = [];
            batchesSinceWrite = 0;
            pendingWrite = persistChunks(chunksToWrite);
          }
        }

        if (pendingWrite) await pendingWrite;
        if (pendingChunks.length > 0) {
          await persistChunks(pendingChunks);
        }
      }

      // Save updated hashes
      await this.writeHashesAtomic(hashPath, currentHashes);

      if (canIncremental) {
        console.error(`Incremental update: ${indexedChunks} chunks embedded, ${deletedPaths.length} files removed.`);
      } else {
        console.error(`Indexed ${indexedChunks} chunks.`);
      }
      return { success: true, chunks: indexedChunks };
    } finally {
      release();
    }
  }

  public async search(query: string, vaultPath: string, limit: number = 5, workspacePath?: string | null, vaultId?: string | null) {
    const release = await this.acquireLock();
    try {
      const table = await this.getTable(vaultPath, workspacePath, vaultId);
      if (!table) {
          return [];
      }

      const embedder = Embedder.getInstance();
      const vector = await embedder.embed(query);

      const results = await table.vectorSearch(vector)
          .limit(limit)
          .toArray();

      return results;
    } finally {
      release();
    }
  }

  private async embedWithFallback(
    embedder: Embedder,
    texts: string[],
    meta: { id: string; text: string; path: string }[]
  ): Promise<NoteChunk[]> {
    if (texts.length === 0) return [];

    try {
      const vectors = await embedder.embedBatch(texts);
      return meta.slice(0, vectors.length).map((item, idx) => ({
        ...item,
        vector: vectors[idx]
      }));
    } catch (batchErr) {
      console.error(`Failed to embed batch of ${texts.length} chunks; retrying one-by-one:`, batchErr);
    }

    const recovered: NoteChunk[] = [];
    for (let i = 0; i < texts.length; i++) {
      try {
        const vector = await embedder.embed(texts[i]);
        recovered.push({
          ...meta[i],
          vector
        });
      } catch (singleErr) {
        console.error(`Failed to embed chunk ${meta[i]?.id ?? i}:`, singleErr);
      }
    }
    return recovered;
  }
}
