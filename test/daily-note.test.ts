import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import moment from 'moment';

/**
 * Simplified mock of the getDailyNoteConfig logic from src/index.ts
 */
async function getDailyNoteConfig(vaultPath: string): Promise<{ folder: string, format: string }> {
    const configPath = path.join(vaultPath, '.obsidian', 'daily-notes.json');
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(data);
        return {
            folder: config.folder || '',
            format: config.format || 'YYYY-MM-DD'
        };
    } catch {
        return { folder: '', format: 'YYYY-MM-DD' };
    }
}

describe('Daily Note Logic', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-note-test-'));
  });

  afterEach(async () => {
    await fs.rm(vaultDir, { recursive: true, force: true });
  });

  it('respects simple folder and format from .obsidian/daily-notes.json', async () => {
    const obsidianDir = path.join(vaultDir, '.obsidian');
    await fs.mkdir(obsidianDir, { recursive: true });
    
    const config = {
      folder: 'Journal',
      format: 'YYYY-MM-DD'
    };
    await fs.writeFile(path.join(obsidianDir, 'daily-notes.json'), JSON.stringify(config));

    const dailyConfig = await getDailyNoteConfig(vaultDir);
    const dateStr = moment().format(dailyConfig.format);
    const relativePath = path.join(dailyConfig.folder, dateStr + '.md');
    
    expect(dailyConfig.folder).toBe('Journal');
    expect(dailyConfig.format).toBe('YYYY-MM-DD');
    expect(relativePath).toBe(`Journal/${dateStr}.md`);
  });

  it('handles nested date formats (subfolders)', async () => {
    const obsidianDir = path.join(vaultDir, '.obsidian');
    await fs.mkdir(obsidianDir, { recursive: true });
    
    const config = {
      folder: 'JRNL',
      format: 'YYYY/MM/YYYY-MM-DD'
    };
    await fs.writeFile(path.join(obsidianDir, 'daily-notes.json'), JSON.stringify(config));

    const dailyConfig = await getDailyNoteConfig(vaultDir);
    const datePath = moment().format(dailyConfig.format);
    const relativePath = path.join(dailyConfig.folder, datePath + '.md');
    
    const expectedDatePath = moment().format('YYYY/MM/YYYY-MM-DD');
    expect(relativePath).toBe(`JRNL/${expectedDatePath}.md`);
  });

  it('falls back to defaults if config is missing', async () => {
    const dailyConfig = await getDailyNoteConfig(vaultDir);
    const dateStr = moment().format('YYYY-MM-DD');
    
    expect(dailyConfig.folder).toBe('');
    expect(dailyConfig.format).toBe('YYYY-MM-DD');
    expect(path.join(dailyConfig.folder, dateStr + '.md')).toBe(`${dateStr}.md`);
  });
});
