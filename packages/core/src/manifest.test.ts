import { describe, expect, it } from 'vitest';
import {
  createSkillManifestFileSchema,
  createSkillManifestSchema,
  isPathSafe,
  skillManifestFileSchema,
  skillManifestSchema,
} from './manifest';

describe('isPathSafe', () => {
  describe('rejects dangerous paths', () => {
    it('rejects parent directory traversal (..)', () => {
      expect(isPathSafe('../.bashrc')).toBe(false);
      expect(isPathSafe('foo/../bar')).toBe(false);
      expect(isPathSafe('foo/../../etc/passwd')).toBe(false);
      expect(isPathSafe('..')).toBe(false);
    });

    it('rejects absolute Unix paths', () => {
      expect(isPathSafe('/etc/passwd')).toBe(false);
      expect(isPathSafe('/home/user/.bashrc')).toBe(false);
      expect(isPathSafe('/.ssh/authorized_keys')).toBe(false);
    });

    it('rejects absolute Windows paths', () => {
      expect(isPathSafe('\\Windows\\System32')).toBe(false);
      expect(isPathSafe('C:\\Windows')).toBe(false);
      expect(isPathSafe('D:\\Users')).toBe(false);
    });

    it('rejects paths with null bytes', () => {
      expect(isPathSafe('file\0.txt')).toBe(false);
      expect(isPathSafe('foo/bar\0/baz')).toBe(false);
    });

    it('rejects empty paths', () => {
      expect(isPathSafe('')).toBe(false);
    });

    it('rejects paths with backslash traversal', () => {
      expect(isPathSafe('..\\..\\etc\\passwd')).toBe(false);
      expect(isPathSafe('foo\\..\\bar')).toBe(false);
    });
  });

  describe('accepts safe paths', () => {
    it('accepts simple filenames', () => {
      expect(isPathSafe('SKILL.md')).toBe(true);
      expect(isPathSafe('README.md')).toBe(true);
      expect(isPathSafe('config.json')).toBe(true);
    });

    it('accepts relative paths with subdirectories', () => {
      expect(isPathSafe('src/index.ts')).toBe(true);
      expect(isPathSafe('rules/initialization.md')).toBe(true);
      expect(isPathSafe('deep/nested/path/file.txt')).toBe(true);
    });

    it('accepts paths with dots in filenames', () => {
      expect(isPathSafe('package.json')).toBe(true);
      expect(isPathSafe('.gitignore')).toBe(true);
      expect(isPathSafe('file.test.ts')).toBe(true);
    });

    it('accepts paths with hyphens and underscores', () => {
      expect(isPathSafe('my-file.md')).toBe(true);
      expect(isPathSafe('my_file.md')).toBe(true);
      expect(isPathSafe('some-dir/another_file.txt')).toBe(true);
    });
  });
});

describe('skillManifestFileSchema', () => {
  it('validates safe paths', () => {
    const result = skillManifestFileSchema.safeParse({
      path: 'SKILL.md',
      content: '# Test',
    });
    expect(result.success).toBe(true);
  });

  it('rejects path traversal', () => {
    const result = skillManifestFileSchema.safeParse({
      path: '../../../.bashrc',
      content: 'malicious',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid file path');
    }
  });

  it('rejects absolute paths', () => {
    const result = skillManifestFileSchema.safeParse({
      path: '/etc/passwd',
      content: 'malicious',
    });
    expect(result.success).toBe(false);
  });
});

describe('skillManifestSchema', () => {
  it('validates manifest with safe paths', () => {
    const result = skillManifestSchema.safeParse({
      schemaVersion: 1,
      files: [
        { path: 'SKILL.md', content: '# Test' },
        { path: 'rules/setup.md', content: '## Setup' },
      ],
      entryPoint: 'SKILL.md',
    });
    expect(result.success).toBe(true);
  });

  it('rejects manifest with path traversal in any file', () => {
    const result = skillManifestSchema.safeParse({
      schemaVersion: 1,
      files: [
        { path: 'SKILL.md', content: '# Test' },
        { path: '../../../.ssh/authorized_keys', content: 'ssh-rsa ATTACKER' },
      ],
      entryPoint: 'SKILL.md',
    });
    expect(result.success).toBe(false);
  });

  it('rejects files that exceed max file bytes', () => {
    const schema = createSkillManifestFileSchema({ maxFileBytes: 10, maxTotalBytes: 100 });
    const result = schema.safeParse({
      path: 'SKILL.md',
      content: '12345678901', // 11 bytes
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('too large');
    }
  });

  it('rejects manifests that exceed max total bytes', () => {
    const schema = createSkillManifestSchema({ maxFileBytes: 100, maxTotalBytes: 20 });
    const result = schema.safeParse({
      schemaVersion: 1,
      files: [
        { path: 'SKILL.md', content: '12345678901' }, // 11 bytes
        { path: 'rules/a.md', content: '12345678901' }, // 11 bytes => 22 total
      ],
      entryPoint: 'SKILL.md',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('manifest is too large'))).toBe(
        true
      );
    }
  });
});
