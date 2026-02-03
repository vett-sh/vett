import { describe, expect, it } from 'vitest';
import { parseSkillRef, findSkillByRef } from './remove';
import type { InstalledSkill } from '@vett/core';

describe('parseSkillRef', () => {
  it('parses full owner/repo/name reference', () => {
    expect(parseSkillRef('mintlify.com/mintlify/mintlify')).toEqual({
      owner: 'mintlify.com',
      repo: 'mintlify',
      name: 'mintlify',
    });
  });

  it('parses name-only reference', () => {
    expect(parseSkillRef('my-skill')).toEqual({
      owner: undefined,
      repo: undefined,
      name: 'my-skill',
    });
  });

  it('rejects invalid references', () => {
    expect(parseSkillRef('owner/repo')).toBeNull(); // missing name
    expect(parseSkillRef('a/b/c/d')).toBeNull(); // too many parts
    expect(parseSkillRef('')).toBeNull();
    expect(parseSkillRef('   ')).toBeNull();
  });

  it('rejects dangerous inputs', () => {
    expect(parseSkillRef('.')).toBeNull();
    expect(parseSkillRef('..')).toBeNull();
    expect(parseSkillRef('/')).toBeNull();
    expect(parseSkillRef('../../../etc')).toBeNull();
    expect(parseSkillRef('~')).toBeNull();
    expect(parseSkillRef('*')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parseSkillRef('  my-skill  ')).toEqual({
      owner: undefined,
      repo: undefined,
      name: 'my-skill',
    });
  });
});

describe('findSkillByRef', () => {
  const skills: InstalledSkill[] = [
    {
      owner: 'acme',
      repo: 'tools',
      name: 'commit',
      version: '1.0',
      installedAt: new Date(),
      path: '/home/user/.vett/skills/acme/tools/commit',
    },
    {
      owner: 'acme',
      repo: 'tools',
      name: 'review',
      version: '1.0',
      installedAt: new Date(),
      path: '/home/user/.vett/skills/acme/tools/review',
    },
    {
      owner: 'other',
      repo: 'stuff',
      name: 'commit',
      version: '2.0',
      installedAt: new Date(),
      path: '/home/user/.vett/skills/other/stuff/commit',
    },
  ];

  it('finds by full reference', () => {
    const result = findSkillByRef(skills, { owner: 'acme', repo: 'tools', name: 'commit' });
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.skill.owner).toBe('acme');
      expect(result.skill.name).toBe('commit');
    }
  });

  it('finds unique name', () => {
    const result = findSkillByRef(skills, { name: 'review' });
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.skill.name).toBe('review');
    }
  });

  it('reports ambiguous when multiple match by name', () => {
    const result = findSkillByRef(skills, { name: 'commit' });
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.matches).toHaveLength(2);
    }
  });

  it('reports not_found when no match', () => {
    const result = findSkillByRef(skills, { name: 'nonexistent' });
    expect(result.status).toBe('not_found');
  });

  it('finds case-insensitively', () => {
    const result = findSkillByRef(skills, { name: 'REVIEW' });
    expect(result.status).toBe('found');
  });

  it('handles empty skills list', () => {
    const result = findSkillByRef([], { name: 'anything' });
    expect(result.status).toBe('not_found');
  });
});
