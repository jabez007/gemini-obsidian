import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import md5 from 'md5';
import { Embedder } from './embedder.js';

const DB_PATH = '.gemini-obsidian-lancedb';

interface NoteChunk {
  id: string;
  path: string;
  text: string;
  vector: number[];
}

export class VaultIndexer {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  constructor() {}

  private async getDb() {
    if (!this.db) {
      this.db = await lancedb.connect(DB_PATH);
    }
    return this.db;
  }

  private async getTable() {
    const db = await this.getDb();
    const tableNames = await db.tableNames();
    if (tableNames.includes('notes')) {
      this.table = await db.openTable('notes');
    }
    return this.table;
  }

  private async createOrGetTable(data?: any[]) {
    const db = await this.getDb();
    const tableNames = await db.tableNames();
    
    if (tableNames.includes('notes')) {
        this.table = await db.openTable('notes');
        if (data && data.length > 0) {
            await this.table.add(data);
        }
    } else {
        if (!data || data.length === 0) {
            // Cannot create empty table easily without schema in some versions, 
            // but let's wait until we have data.
            return null;
        }
        this.table = await db.createTable('notes', data);
    }
    return this.table;
  }

  public async indexVault(vaultPath: string) {
    const embedder = Embedder.getInstance();
    
    // 1. Find all markdown files
    const files = await glob('**/*.md', { cwd: vaultPath, absolute: true });
    
    console.error(`Found ${files.length} notes in ${vaultPath}`);

    const chunks: NoteChunk[] = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data, content: body } = matter(content);
        
        // Simple chunking by paragraphs for now
        // A better approach would be recursive character text splitter or header-based
        const relativePath = path.relative(vaultPath, filePath);
        const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim().length > 0);

        for (let i = 0; i < paragraphs.length; i++) {
          const text = paragraphs[i].trim();
          if (text.length < 20) continue; // Skip very short chunks

          // Include metadata in embedding context if useful, but here we just embed text
          // We prepend title/path to context for better retrieval
          const context = `File: ${relativePath}\nContent: ${text}`;
          
          try {
              const vector = await embedder.embed(context);
              chunks.push({
                  id: md5(`${relativePath}-${i}`),
                  path: relativePath,
                  text: text,
                  vector: vector
              });
          } catch (err) {
              console.error(`Failed to embed chunk in ${relativePath}:`, err);
          }
        }
      } catch (err) {
        console.error(`Failed to process file ${filePath}:`, err);
        continue;
      }
    }

    if (chunks.length > 0) {
        // Drop existing table to full re-index (simplest for now)
        const db = await this.getDb();
        try {
            await db.dropTable('notes');
        } catch (e) { /* ignore if not exists */ }
        
        await this.createOrGetTable(chunks);
        console.error(`Indexed ${chunks.length} chunks.`);
        return { success: true, chunks: chunks.length };
    } else {
        return { success: false, message: "No content found to index." };
    }
  }

  public async search(query: string, limit: number = 5) {
    const table = await this.getTable();
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
}
