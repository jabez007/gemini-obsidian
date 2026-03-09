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
  private table: lancedb.Table | null = null;
  private dbPath: string | null = null;
  private hashPath: string | null = null;

  constructor() {}

  private async initializePaths(vaultPath: string, workspacePath?: string | null) {
    if (this.dbPath && this.hashPath) return;

    let baseStorePath: string;

    if (workspacePath) {
      baseStorePath = path.join(workspacePath, '.gemini-obsidian');
    } else {
      // Hashed Global Cache: ~/.gemini-obsidian/vaults/<hash_of_vault_path>
      const vaultHash = md5(path.resolve(vaultPath));
      baseStorePath = path.join(os.homedir(), '.gemini-obsidian', 'vaults', vaultHash);
    }

    this.dbPath = path.join(baseStorePath, 'lancedb');
    this.hashPath = path.join(baseStorePath, 'file-hashes.json');

    // Ensure the storage directory exists
    await fs.mkdir(baseStorePath, { recursive: true });
  }

  private async getDb(vaultPath: string, workspacePath?: string | null) {
    if (!this.db) {
      await this.initializePaths(vaultPath, workspacePath);
      this.db = await lancedb.connect(this.dbPath!);
    }
    return this.db;
  }

  private async getTable(vaultPath: string, workspacePath?: string | null) {
    const db = await this.getDb(vaultPath, workspacePath);
    const tableNames = await db.tableNames();
    if (tableNames.includes('notes')) {
      this.table = await db.openTable('notes');
    }
    return this.table;
  }

  public async indexFile(vaultPath: string, relativePath: string, workspacePath?: string | null) {
    const embedder = Embedder.getInstance();
    const filePath = getSafeFilePath(vaultPath, relativePath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data, content: body } = matter(content);

      const { textsToEmbed, chunkMetadata } = buildEmbeddingInputs(relativePath, body, chunkingOptionsFromEnv());

      if (textsToEmbed.length > 0) {
          const chunks = await this.embedWithFallback(embedder, textsToEmbed, chunkMetadata);
          if (chunks.length === 0) {
              return { success: false, message: `Failed to embed content for ${relativePath}.` };
          }
          const chunkRows = chunks as unknown as Record<string, unknown>[];

          const db = await this.getDb(vaultPath, workspacePath);
          const tableNames = await db.tableNames();
          if (!tableNames.includes('notes')) {
              this.table = await db.createTable('notes', chunkRows);
          } else {
              this.table = await db.openTable('notes');
              // Delete old chunks for this file
              await this.table.delete(`path = '${relativePath.replace(/'/g, "''")}'`);
              await this.table.add(chunkRows);
          }
          console.error(`Indexed ${chunks.length} chunks for ${relativePath}.`);
          return { success: true, chunks: chunks.length };
      }
      return { success: false, message: "No content to index or table not available." };
    } catch (err) {
      console.error(`Failed to index file ${filePath}:`, err);
      return { success: false, message: String(err) };
    }
  }

  public async indexVault(vaultPath: string, force: boolean = false, workspacePath?: string | null) {
    await this.initializePaths(vaultPath, workspacePath);
    const embedder = Embedder.getInstance();
    const db = await this.getDb(vaultPath, workspacePath);

    // Find all markdown files
    const files = await glob('**/*.md', { cwd: vaultPath, absolute: true });
    console.error(`Found ${files.length} notes in ${vaultPath}`);

    // Load previous file hashes for incremental indexing
    let previousHashes: Record<string, string> = {};
    if (!force) {
      try {
        previousHashes = JSON.parse(await fs.readFile(this.hashPath!, 'utf-8'));
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
    const currentHashes: Record<string, string> = {};
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
            const relativePath = path.relative(vaultPath, filePath);
            const contentHash = md5(content);
            currentHashes[relativePath] = contentHash;

            // Skip unchanged files in incremental mode
            if (canIncremental && previousHashes[relativePath] === contentHash) {
              return null;
            }

            changedPaths.push(relativePath);
            const { content: body } = matter(content);
            return buildEmbeddingInputs(relativePath, body, chunkingOptionsFromEnv());
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
    const deletedPaths = Object.keys(previousHashes).filter(p => !(p in currentHashes));

    if (canIncremental) {
      console.error(`Incremental: ${changedPaths.length} changed, ${deletedPaths.length} deleted, ${skippedFiles} unchanged`);
    } else {
      console.error(`Full index: ${allTexts.length} chunks from ${files.length} files`);
    }

    // Early exit: nothing changed
    if (canIncremental && allTexts.length === 0 && deletedPaths.length === 0) {
      console.error('Index is up to date, no changes detected.');
      await fs.writeFile(this.hashPath!, JSON.stringify(currentHashes));
      return { success: true, chunks: 0, message: 'Index up to date, no changes detected.' };
    }

    if (!canIncremental && allTexts.length === 0) {
      return { success: false, message: "No content found to index." };
    }

    // ── Phase 2: Update index ─────────────────────────────────────────

    let indexedChunks = 0;
    let tableInitialized = false;

    // For incremental mode: delete old chunks for changed/deleted files, keep existing table
    if (canIncremental) {
      this.table = await db.openTable('notes');
      const pathsToDelete = [...changedPaths, ...deletedPaths];
      if (pathsToDelete.length > 0) {
        const DELETE_BATCH = 100;
        for (let i = 0; i < pathsToDelete.length; i += DELETE_BATCH) {
          const batch = pathsToDelete.slice(i, i + DELETE_BATCH);
          const escaped = batch.map(p => `'${p.replace(/'/g, "''")}'`);
          await this.table.delete(`path IN (${escaped.join(', ')})`);
        }
      }
      tableInitialized = true;
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
          this.table = await db.createTable('notes', chunkRows);
          tableInitialized = true;
        } else {
          if (!this.table) {
            this.table = await db.openTable('notes');
          }
          await this.table.add(chunkRows);
        }

        indexedChunks += chunks.length;
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

      // Flush remaining chunks
      if (pendingWrite) await pendingWrite;
      if (pendingChunks.length > 0) {
        await persistChunks(pendingChunks);
      }
    }

    // Save updated hashes
    await fs.writeFile(this.hashPath!, JSON.stringify(currentHashes));

    if (canIncremental) {
      console.error(`Incremental update: ${indexedChunks} chunks embedded, ${deletedPaths.length} files removed.`);
    } else {
      console.error(`Indexed ${indexedChunks} chunks.`);
    }
    return { success: true, chunks: indexedChunks };
  }

  public async search(query: string, vaultPath: string, limit: number = 5, workspacePath?: string | null) {
    const table = await this.getTable(vaultPath, workspacePath);
    if (!table) {
        return [];
    }

    const embedder = Embedder.getInstance();
    const vector = await embedder.embed(query);

    const results = await table.vectorSearch(vector)
        .limit(limit)
        .toArray();

    return results;
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
