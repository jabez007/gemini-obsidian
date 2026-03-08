import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { extractWikilinks, findSectionRange, replaceSection, insertAtHeading } from '../src/utils';
import matter from 'gray-matter';

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
});

afterEach(async () => {
  await fs.rm(vaultDir, { recursive: true, force: true });
});

describe('vault file operations', () => {
  it('create and read round-trip', async () => {
    const filePath = path.join(vaultDir, 'test.md');
    const content = '# Hello\n\nWorld';
    await fs.writeFile(filePath, content, 'utf-8');
    const read = await fs.readFile(filePath, 'utf-8');
    expect(read).toBe(content);
  });

  it('append to note', async () => {
    const filePath = path.join(vaultDir, 'test.md');
    await fs.writeFile(filePath, '# Note', 'utf-8');
    await fs.appendFile(filePath, '\nAppended text', 'utf-8');
    const read = await fs.readFile(filePath, 'utf-8');
    expect(read).toBe('# Note\nAppended text');
  });

  it('search by filename', async () => {
    await fs.writeFile(path.join(vaultDir, 'alpha.md'), 'content', 'utf-8');
    await fs.writeFile(path.join(vaultDir, 'beta.md'), 'content', 'utf-8');
    const files = await fs.readdir(vaultDir);
    const matches = files.filter(f => f.toLowerCase().includes('alpha'));
    expect(matches).toEqual(['alpha.md']);
  });

  it('search by content', async () => {
    await fs.writeFile(path.join(vaultDir, 'a.md'), 'needle in haystack', 'utf-8');
    await fs.writeFile(path.join(vaultDir, 'b.md'), 'nothing here', 'utf-8');
    const files = await fs.readdir(vaultDir);
    const matches: string[] = [];
    for (const f of files) {
      const c = await fs.readFile(path.join(vaultDir, f), 'utf-8');
      if (c.includes('needle')) matches.push(f);
    }
    expect(matches).toEqual(['a.md']);
  });

  it('get_links extracts wikilinks', async () => {
    const filePath = path.join(vaultDir, 'links.md');
    await fs.writeFile(filePath, 'See [[PageA]] and [[PageB|alias]].', 'utf-8');
    const content = await fs.readFile(filePath, 'utf-8');
    const links = extractWikilinks(content);
    expect(links).toEqual(['PageA', 'PageB']);
  });

  it('get_backlinks finds linking notes', async () => {
    await fs.writeFile(path.join(vaultDir, 'source.md'), 'Links to [[Target]].', 'utf-8');
    await fs.writeFile(path.join(vaultDir, 'other.md'), 'No links here.', 'utf-8');

    const target = 'Target';
    const linkRegex = new RegExp(`\\[\\[${target}([\\]\\|#])`, 'i');
    const files = await fs.readdir(vaultDir);
    const backlinks: string[] = [];
    for (const f of files) {
      const content = await fs.readFile(path.join(vaultDir, f), 'utf-8');
      if (linkRegex.test(content)) backlinks.push(f);
    }
    expect(backlinks).toEqual(['source.md']);
  });

  it('move_note renames file', async () => {
    const src = path.join(vaultDir, 'old.md');
    const dest = path.join(vaultDir, 'new.md');
    await fs.writeFile(src, 'content', 'utf-8');
    await fs.rename(src, dest);
    const exists = await fs.stat(dest).then(() => true).catch(() => false);
    expect(exists).toBe(true);
    const srcExists = await fs.stat(src).then(() => true).catch(() => false);
    expect(srcExists).toBe(false);
  });

  it('update_frontmatter sets a key', async () => {
    const filePath = path.join(vaultDir, 'fm.md');
    await fs.writeFile(filePath, '---\ntags: []\n---\n\n# Note', 'utf-8');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(fileContent);
    parsed.data['status'] = 'done';
    const updated = matter.stringify(parsed.content, parsed.data);
    await fs.writeFile(filePath, updated, 'utf-8');
    const re = matter(await fs.readFile(filePath, 'utf-8'));
    expect(re.data.status).toBe('done');
    expect(re.data.tags).toEqual([]);
  });

  it('replace_section replaces body under heading', async () => {
    const filePath = path.join(vaultDir, 'sections.md');
    const original = '## Status\n\nOld status\n\n## Notes\n\nSome notes';
    await fs.writeFile(filePath, original, 'utf-8');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const range = findSectionRange(fileContent, 'Status');
    expect(range).not.toBeNull();
    const updated = replaceSection(fileContent, range!, 'New status');
    await fs.writeFile(filePath, updated, 'utf-8');
    const result = await fs.readFile(filePath, 'utf-8');
    expect(result).toContain('New status');
    expect(result).not.toContain('Old status');
    expect(result).toContain('## Notes');
  });

  it('insert_at_heading appends at end of section', async () => {
    const filePath = path.join(vaultDir, 'insert.md');
    const original = '## Log\n\nExisting entry\n\n## Other';
    await fs.writeFile(filePath, original, 'utf-8');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const range = findSectionRange(fileContent, 'Log');
    const updated = insertAtHeading(fileContent, 'Log', 'New entry', 'end', range);
    await fs.writeFile(filePath, updated, 'utf-8');
    const result = await fs.readFile(filePath, 'utf-8');
    expect(result).toContain('Existing entry');
    expect(result).toContain('New entry');
  });

  it('move_note into subdirectory', async () => {
    const src = path.join(vaultDir, 'note.md');
    const destDir = path.join(vaultDir, 'archive');
    const dest = path.join(destDir, 'note.md');
    await fs.writeFile(src, 'content', 'utf-8');
    await fs.mkdir(destDir, { recursive: true });
    await fs.rename(src, dest);
    const content = await fs.readFile(dest, 'utf-8');
    expect(content).toBe('content');
  });
});
