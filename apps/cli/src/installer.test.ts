import { describe, expect, it } from 'vitest';
import { sanitizeName, isPathSafe, getAgentSkillPath } from './installer';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('sanitizeName', () => {
  it('converts to lowercase', () => {
    expect(sanitizeName('MySkill')).toBe('myskill');
    expect(sanitizeName('UPPERCASE')).toBe('uppercase');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeName('my skill name')).toBe('my-skill-name');
    expect(sanitizeName('multiple   spaces')).toBe('multiple-spaces');
  });

  it('replaces special characters with hyphens', () => {
    expect(sanitizeName('my@skill!name')).toBe('my-skill-name');
    expect(sanitizeName('skill/with/slashes')).toBe('skill-with-slashes');
  });

  it('preserves dots and underscores', () => {
    expect(sanitizeName('my.skill')).toBe('my.skill');
    expect(sanitizeName('my_skill')).toBe('my_skill');
    expect(sanitizeName('v1.0.0_beta')).toBe('v1.0.0_beta');
  });

  it('removes leading/trailing dots and hyphens', () => {
    expect(sanitizeName('.hidden')).toBe('hidden');
    expect(sanitizeName('..dangerous')).toBe('dangerous');
    expect(sanitizeName('-prefixed')).toBe('prefixed');
    expect(sanitizeName('trailing-')).toBe('trailing');
    expect(sanitizeName('...dots...')).toBe('dots');
  });

  it('neutralizes path traversal attempts', () => {
    // Note: sanitizeName replaces slashes with hyphens but preserves dots.
    // The resulting names are safe because they don't contain actual path separators.
    // isPathSafe provides the second layer of defense against traversal.
    expect(sanitizeName('../../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeName('..\\..\\windows\\system32')).toBe('windows-system32');
    // Dots are preserved, but slashes become hyphens, making it safe
    expect(sanitizeName('foo/../bar')).toBe('foo-..-bar');
    // The important thing is no actual path separators remain
    expect(sanitizeName('foo/../bar')).not.toContain('/');
    expect(sanitizeName('foo\\..\\bar')).not.toContain('\\');
  });

  it('handles empty or whitespace-only input', () => {
    expect(sanitizeName('')).toBe('unnamed-skill');
    expect(sanitizeName('   ')).toBe('unnamed-skill');
    expect(sanitizeName('...')).toBe('unnamed-skill');
    expect(sanitizeName('---')).toBe('unnamed-skill');
  });

  it('truncates long names', () => {
    const longName = 'a'.repeat(300);
    expect(sanitizeName(longName).length).toBe(255);
  });

  it('handles real skill names', () => {
    expect(sanitizeName('composition-patterns')).toBe('composition-patterns');
    expect(sanitizeName('Git Review Before Commit')).toBe('git-review-before-commit');
    expect(sanitizeName('my-skill@v1.0')).toBe('my-skill-v1.0');
  });
});

describe('isPathSafe', () => {
  it('returns true for paths within base', () => {
    expect(isPathSafe('/home/user/.claude/skills', '/home/user/.claude/skills/my-skill')).toBe(
      true
    );
    expect(isPathSafe('/home/user/.claude/skills', '/home/user/.claude/skills/nested/skill')).toBe(
      true
    );
  });

  it('returns true for exact base path match', () => {
    expect(isPathSafe('/home/user/.claude/skills', '/home/user/.claude/skills')).toBe(true);
  });

  it('returns false for paths outside base', () => {
    expect(isPathSafe('/home/user/.claude/skills', '/home/user/.cursor/skills/my-skill')).toBe(
      false
    );
    expect(isPathSafe('/home/user/.claude/skills', '/etc/passwd')).toBe(false);
  });

  it('returns false for path traversal attempts', () => {
    expect(
      isPathSafe('/home/user/.claude/skills', '/home/user/.claude/skills/../../../etc/passwd')
    ).toBe(false);
    expect(isPathSafe('/home/user/.claude/skills', '/home/user/.claude/skills/../../..')).toBe(
      false
    );
  });

  it('returns false for sibling paths with similar prefix', () => {
    // /base/skills vs /base/skills-other should fail
    expect(isPathSafe('/home/user/skills', '/home/user/skills-other/my-skill')).toBe(false);
  });

  it('normalizes paths', () => {
    expect(isPathSafe('/home/user/.claude/skills', '/home/user/.claude/skills/./my-skill')).toBe(
      true
    );
    expect(isPathSafe('/home/user/.claude/skills/', '/home/user/.claude/skills/my-skill')).toBe(
      true
    );
  });

  it('handles relative paths by resolving them', () => {
    // These will be resolved against cwd, so the test is more about ensuring no errors
    const basePath = join(process.cwd(), 'test-base');
    const targetPath = join(process.cwd(), 'test-base', 'sub');
    expect(isPathSafe(basePath, targetPath)).toBe(true);
  });
});

describe('getAgentSkillPath', () => {
  it('returns global path for claude-code', () => {
    const result = getAgentSkillPath('my-skill', 'claude-code', { global: true });
    expect(result).not.toBeNull();
    expect(result!.skillDir).toContain('.claude');
    expect(result!.skillDir).toContain('skills');
    expect(result!.skillDir).toContain('my-skill');
  });

  it('returns project path when global is false', () => {
    const cwd = '/test/project';
    const result = getAgentSkillPath('my-skill', 'cursor', { global: false, cwd });
    expect(result).not.toBeNull();
    expect(result!.skillDir).toBe(join(cwd, '.cursor/skills', 'my-skill'));
  });

  it('returns null for agents that dont support global', () => {
    const result = getAgentSkillPath('my-skill', 'replit', { global: true });
    expect(result).toBeNull();
  });

  it('sanitizes skill names in path', () => {
    const result = getAgentSkillPath('My Skill Name', 'claude-code', { global: true });
    expect(result).not.toBeNull();
    expect(result!.skillDir).toContain('my-skill-name');
    expect(result!.skillDir).not.toContain('My Skill Name');
  });

  it('uses cwd for project paths', () => {
    const result = getAgentSkillPath('skill', 'cursor', { global: false, cwd: '/my/project' });
    expect(result).not.toBeNull();
    expect(result!.agentBase).toBe('/my/project/.cursor/skills');
  });
});
