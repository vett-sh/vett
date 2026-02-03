import { describe, expect, it } from 'vitest';
import { parseSkillUrl, isValidSkillId } from './url-parser';

describe('parseSkillUrl', () => {
  describe('GitHub URLs', () => {
    it('parses owner/repo/tree/ref/skills/name format', () => {
      const result = parseSkillUrl(
        'https://github.com/vercel-labs/agent-skills/tree/main/skills/react'
      );
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('vercel-labs');
      expect(result.repo).toBe('agent-skills');
      expect(result.skill).toBe('react');
      expect(result.ref).toBe('main');
      expect(result.id).toBe('github.com/vercel-labs/agent-skills/react');
    });

    it('parses owner/repo format', () => {
      const result = parseSkillUrl('https://github.com/anthropics/skills');
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('anthropics');
      expect(result.repo).toBe('skills');
      expect(result.skill).toBeUndefined();
      expect(result.id).toBe('github.com/anthropics/skills');
    });

    it('strips .git suffix from repo', () => {
      const result = parseSkillUrl('git@github.com:anthropics/skills.git');
      expect(result.repo).toBe('skills');
    });

    it('infers github.com for shorthand owner/repo', () => {
      const result = parseSkillUrl('vercel/next.js');
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('vercel');
      expect(result.repo).toBe('next.js');
    });
  });

  describe('HTTP URLs (non-git hosts)', () => {
    it('extracts skill name from skill.md convention', () => {
      // mintlify.com/docs/skill.md -> skill is "docs", not "docs/docs"
      const result = parseSkillUrl('https://www.mintlify.com/docs/skill.md');
      expect(result.host).toBe('mintlify.com');
      expect(result.repo).toBe('mintlify');
      expect(result.skill).toBe('docs');
      expect(result.id).toBe('mintlify.com/mintlify/docs');
    });

    it('extracts skill name from named file', () => {
      // example.com/docs/frontend.md -> skill is "frontend"
      const result = parseSkillUrl('https://example.com/docs/frontend.md');
      expect(result.host).toBe('example.com');
      expect(result.repo).toBe('docs');
      expect(result.skill).toBe('frontend');
      expect(result.id).toBe('example.com/docs/frontend');
    });

    it('handles deep paths with skill.md', () => {
      // example.com/path/to/docs/skill.md -> repo=path/to, skill=docs
      const result = parseSkillUrl('https://example.com/path/to/docs/skill.md');
      expect(result.host).toBe('example.com');
      expect(result.repo).toBe('path/to');
      expect(result.skill).toBe('docs');
      expect(result.id).toBe('example.com/path/to/docs');
    });

    it('handles single-component path with skill.md', () => {
      // example.com/skill.md -> use host base for both repo and skill
      const result = parseSkillUrl('https://example.com/skill.md');
      expect(result.host).toBe('example.com');
      expect(result.repo).toBe('example');
      expect(result.skill).toBe('example');
    });

    it('handles single-component path with named file', () => {
      // example.com/frontend.md -> repo=example, skill=frontend
      const result = parseSkillUrl('https://example.com/frontend.md');
      expect(result.host).toBe('example.com');
      expect(result.repo).toBe('example');
      expect(result.skill).toBe('frontend');
    });

    it('handles bare domain', () => {
      const result = parseSkillUrl('https://example.com/');
      expect(result.host).toBe('example.com');
      expect(result.repo).toBe('example');
      expect(result.skill).toBe('example');
    });
  });
});

describe('isValidSkillId', () => {
  it('accepts valid IDs', () => {
    expect(isValidSkillId('github.com/owner/repo')).toBe(true);
    expect(isValidSkillId('github.com/owner/repo/skill')).toBe(true);
    expect(isValidSkillId('example.com/docs/frontend')).toBe(true);
  });

  it('rejects IDs without domain', () => {
    expect(isValidSkillId('owner/repo')).toBe(false);
  });

  it('rejects IDs with empty parts', () => {
    expect(isValidSkillId('github.com//repo')).toBe(false);
    expect(isValidSkillId('github.com/owner/')).toBe(false);
  });
});
