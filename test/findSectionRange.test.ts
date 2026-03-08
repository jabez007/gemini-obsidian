import { describe, it, expect } from 'vitest';
import { findSectionRange } from '../src/utils';

describe('findSectionRange', () => {
  it('finds a level-2 heading', () => {
    const content = '# Title\n\n## Section\n\nBody text here.\n\n## Next';
    const result = findSectionRange(content, 'Section');
    expect(result).not.toBeNull();
    expect(result!.level).toBe(2);
    // bodyStart is right after the heading text; body includes the newlines between heading and content
    const body = content.slice(result!.bodyStart, result!.bodyEnd);
    expect(body).toContain('Body text here.');
    expect(body).not.toContain('## Next');
  });

  it('finds a level-1 heading', () => {
    const content = '# Main\n\nSome content.';
    const result = findSectionRange(content, 'Main');
    expect(result).not.toBeNull();
    expect(result!.level).toBe(1);
  });

  it('finds heading at start of file', () => {
    const content = '## Start\n\nContent here.';
    const result = findSectionRange(content, 'Start');
    expect(result).not.toBeNull();
    expect(result!.headingStart).toBe(0);
  });

  it('extends section to EOF when no next heading', () => {
    const content = '## Only\n\nBody all the way to the end.';
    const result = findSectionRange(content, 'Only');
    expect(result).not.toBeNull();
    expect(result!.bodyEnd).toBe(content.length);
  });

  it('terminates at same-level heading', () => {
    const content = '## A\n\nBody A\n\n## B\n\nBody B';
    const result = findSectionRange(content, 'A');
    expect(result).not.toBeNull();
    const body = content.slice(result!.bodyStart, result!.bodyEnd);
    expect(body).toContain('Body A');
    expect(body).not.toContain('Body B');
  });

  it('terminates at higher-level heading', () => {
    const content = '## Sub\n\nSub content\n\n# Top\n\nTop content';
    const result = findSectionRange(content, 'Sub');
    expect(result).not.toBeNull();
    const body = content.slice(result!.bodyStart, result!.bodyEnd);
    expect(body).toContain('Sub content');
    expect(body).not.toContain('Top content');
  });

  it('includes lower-level sub-headings in section', () => {
    const content = '## Parent\n\n### Child\n\nChild content\n\n## Sibling';
    const result = findSectionRange(content, 'Parent');
    expect(result).not.toBeNull();
    const body = content.slice(result!.bodyStart, result!.bodyEnd);
    expect(body).toContain('### Child');
    expect(body).toContain('Child content');
  });

  it('returns null when heading not found', () => {
    const content = '## Exists\n\nContent';
    expect(findSectionRange(content, 'Missing')).toBeNull();
  });

  it('handles special regex characters in heading text', () => {
    const content = '## What (is) this?\n\nAnswer here.\n\n## Next';
    const result = findSectionRange(content, 'What (is) this?');
    expect(result).not.toBeNull();
    const body = content.slice(result!.bodyStart, result!.bodyEnd);
    expect(body).toContain('Answer here.');
  });

  it('handles level-6 heading', () => {
    const content = '###### Deep\n\nDeep content';
    const result = findSectionRange(content, 'Deep');
    expect(result).not.toBeNull();
    expect(result!.level).toBe(6);
  });

  it('handles heading in middle of file', () => {
    const content = '# Top\n\nIntro\n\n## Middle\n\nMiddle content\n\n## End';
    const result = findSectionRange(content, 'Middle');
    expect(result).not.toBeNull();
    expect(result!.headingStart).toBeGreaterThan(0);
  });
});
