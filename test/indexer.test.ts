import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { VaultIndexer } from '../src/rag/store';
import md5 from 'md5';

// Mock the embedder to avoid loading real models during tests
vi.mock('../src/rag/embedder', () => ({
  Embedder: {
    getInstance: () => ({
      embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
      embedBatch: vi.fn().mockImplementation((texts: string[]) => 
        Promise.resolve(texts.map(() => new Array(384).fill(0.1)))
      ),
    })
  }
}));

// Global mock for os.homedir to allow control in tests
let mockHomedir: string | null = null;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => mockHomedir || actual.homedir(),
  };
});

describe('VaultIndexer path resolution and storage', () => {
  let tempDir: string;
  let vaultPath: string;
  let workspacePath: string;
  let indexer: VaultIndexer;

  beforeEach(async () => {
    mockHomedir = null;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-obsidian-test-'));
    vaultPath = path.join(tempDir, 'my-vault');
    workspacePath = path.join(tempDir, 'my-workspace');
    await fs.mkdir(vaultPath, { recursive: true });
    await fs.mkdir(workspacePath, { recursive: true });
    indexer = new VaultIndexer();
  });

  afterEach(async () => {
    // Reset indexer state
    if (indexer) {
      await indexer.reset();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    mockHomedir = null;
  });

  it('uses workspace_path when provided', async () => {
    // Add a note long enough to be indexed
    await fs.writeFile(path.join(vaultPath, 'note.md'), 'This is a sufficiently long note to pass the minimum chunk size filter of forty characters.', 'utf-8');
    
    await indexer.indexVault(vaultPath, false, workspacePath);

    const vaultHash = md5(path.resolve(vaultPath));
    const expectedDbPath = path.join(workspacePath, '.gemini-obsidian', 'vaults', vaultHash, 'lancedb');
    const expectedHashPath = path.join(workspacePath, '.gemini-obsidian', 'vaults', vaultHash, 'file-hashes.json');

    const dbExists = await fs.stat(expectedDbPath).then(() => true).catch(() => false);
    const hashExists = await fs.stat(expectedHashPath).then(() => true).catch(() => false);

    expect(dbExists).toBe(true);
    expect(hashExists).toBe(true);
  });

  it('uses hashed global cache when workspace_path is not provided', async () => {
    // Add a note long enough to be indexed
    await fs.writeFile(path.join(vaultPath, 'note.md'), 'This is a sufficiently long note to pass the minimum chunk size filter of forty characters.', 'utf-8');

    const vaultHash = md5(path.resolve(vaultPath));
    // Set the mock homedir to our temp test dir
    mockHomedir = tempDir;
    const expectedGlobalPath = path.join(tempDir, '.gemini-obsidian', 'vaults', vaultHash);
    
    await indexer.indexVault(vaultPath, false);

    const dbExists = await fs.stat(path.join(expectedGlobalPath, 'lancedb')).then(() => true).catch(() => false);
    const hashExists = await fs.stat(path.join(expectedGlobalPath, 'file-hashes.json')).then(() => true).catch(() => false);

    expect(dbExists).toBe(true);
    expect(hashExists).toBe(true);
  });

  it('successfully indexes and searches a mock vault', async () => {
    // Create a mock note
    const notePath = path.join(vaultPath, 'test-note.md');
    await fs.writeFile(notePath, '---\ntitle: Test\n---\nThis is a test note about cats. Cats are very interesting animals that many people keep as pets in their homes.', 'utf-8');

    const result = await indexer.indexVault(vaultPath, true, workspacePath);
    
    expect(result.success).toBe(true);
    expect(result.chunks).toBeGreaterThan(0);

    const searchResults = await indexer.search('cats', vaultPath, 5, workspacePath);
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].path).toBe('test-note.md');
    expect(searchResults[0].text).toContain('cats');
  });
});
