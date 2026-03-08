import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { extractWikilinks, findSectionRange, replaceSection, insertAtHeading, getSafeFilePath } from '../src/utils';

describe('extractWikilinks', () => {
  it('extracts simple wikilinks', () => {
    expect(extractWikilinks('See [[Note]].')).toEqual(['Note']);
  });

  it('extracts aliased wikilinks', () => {
    expect(extractWikilinks('See [[Note|display text]].')).toEqual(['Note']);
  });

  it('extracts multiple links', () => {
    const content = '[[A]] and [[B]] and [[C]]';
    expect(extractWikilinks(content)).toEqual(['A', 'B', 'C']);
  });

  it('deduplicates links', () => {
    const content = '[[A]] then [[A]] again';
    expect(extractWikilinks(content)).toEqual(['A']);
  });

  it('returns empty array when no links', () => {
    expect(extractWikilinks('No links here.')).toEqual([]);
  });

  it('handles links with paths', () => {
    expect(extractWikilinks('[[folder/Note]]')).toEqual(['folder/Note']);
  });

  it('handles links with heading anchors', () => {
    expect(extractWikilinks('[[Note#Section]]')).toEqual(['Note#Section']);
  });
});

describe('replaceSection', () => {
  it('replaces body between heading and next same-level heading', () => {
    const content = '## Status\n\nOld body\n\n## Notes\n\nKeep this';
    const range = findSectionRange(content, 'Status')!;
    const result = replaceSection(content, range, 'New body');
    expect(result).toContain('New body');
    expect(result).not.toContain('Old body');
    expect(result).toContain('## Notes');
    expect(result).toContain('Keep this');
  });

  it('replaces section that extends to EOF', () => {
    const content = '## Only\n\nOld content';
    const range = findSectionRange(content, 'Only')!;
    const result = replaceSection(content, range, 'Replaced');
    expect(result).toContain('## Only');
    expect(result).toContain('Replaced');
    expect(result).not.toContain('Old content');
  });
});

describe('insertAtHeading', () => {
  it('inserts at end of section', () => {
    const content = '## Log\n\nExisting\n\n## Other';
    const range = findSectionRange(content, 'Log');
    const result = insertAtHeading(content, 'Log', 'Added', 'end', range);
    expect(result).toContain('Existing');
    expect(result).toContain('Added');
    expect(result).toContain('## Other');
  });

  it('inserts at beginning of section', () => {
    const content = '## Log\n\nExisting\n\n## Other';
    const range = findSectionRange(content, 'Log');
    const result = insertAtHeading(content, 'Log', 'First', 'beginning', range);
    expect(result).toContain('First');
    expect(result).toContain('Existing');
    // "First" should appear before "Existing"
    expect(result.indexOf('First')).toBeLessThan(result.indexOf('Existing'));
  });

  it('creates new section when heading not found', () => {
    const content = '## Existing\n\nBody';
    const result = insertAtHeading(content, 'NewSection', 'New content', 'end', null);
    expect(result).toContain('## NewSection\nNew content');
    expect(result).toContain('## Existing');
  });

  it('handles section ending at EOF without trailing newline', () => {
    const content = '## Log\n\nEntry without trailing newline';
    const range = findSectionRange(content, 'Log');
    const result = insertAtHeading(content, 'Log', 'Appended', 'end', range);
    expect(result).toContain('Entry without trailing newline');
    expect(result).toContain('Appended');
    // Should have a newline separator before "Appended" since content doesn't end with one
    expect(result).toContain('\nAppended');
  });

  it('handles section at EOF with trailing newline', () => {
    const content = '## Log\n\nEntry with trailing newline\n';
    const range = findSectionRange(content, 'Log');
    const result = insertAtHeading(content, 'Log', 'Appended', 'end', range);
    expect(result).toContain('Entry with trailing newline');
    expect(result).toContain('Appended');
    // Should not double up newlines
    expect(result).not.toContain('\n\nAppended');
  });

  it('handles empty file content with missing heading', () => {
    const result = insertAtHeading('', 'Tasks', 'First task', 'end', null);
    expect(result).toContain('## Tasks\nFirst task');
  });
});

describe('getSafeFilePath', () => {
  const vault = '/home/user/vault';

  it('resolves a normal relative path', () => {
    const result = getSafeFilePath(vault, 'notes/hello.md');
    expect(result).toBe(path.resolve(vault, 'notes/hello.md'));
  });

  it('allows path equal to vault root', () => {
    const result = getSafeFilePath(vault, '.');
    expect(result).toBe(path.resolve(vault));
  });

  it('throws on ../ traversal', () => {
    expect(() => getSafeFilePath(vault, '../secret.md')).toThrow('Path traversal detected');
  });

  it('throws on deep traversal (../../etc/passwd)', () => {
    expect(() => getSafeFilePath(vault, '../../etc/passwd')).toThrow('Path traversal detected');
  });

  it('throws on absolute path outside vault', () => {
    expect(() => getSafeFilePath(vault, '/etc/passwd')).toThrow('Path traversal detected');
  });

  it('allows absolute path inside vault', () => {
    const inside = path.join(vault, 'notes', 'file.md');
    const result = getSafeFilePath(vault, inside);
    expect(result).toBe(inside);
  });
});
