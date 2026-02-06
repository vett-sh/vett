import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertNoSymlinkPathComponents, SymlinkTraversalError } from './fs-safety';

describe('assertNoSymlinkPathComponents', () => {
  it('allows normal paths without symlinks', () => {
    const base = mkdtempSync(join(tmpdir(), 'vett-fs-safety-'));
    mkdirSync(join(base, 'a', 'b'), { recursive: true });
    expect(() => assertNoSymlinkPathComponents(base, 'a/b/file.txt')).not.toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'rejects when an intermediate directory is a symlink',
    () => {
      const base = mkdtempSync(join(tmpdir(), 'vett-fs-safety-'));
      const outside = mkdtempSync(join(tmpdir(), 'vett-outside-'));

      // base/link -> outside
      symlinkSync(outside, join(base, 'link'), 'dir');
      expect(() => assertNoSymlinkPathComponents(base, 'link/evil.txt')).toThrow(
        SymlinkTraversalError
      );
    }
  );

  it.skipIf(process.platform === 'win32')('rejects when the target file path is a symlink', () => {
    const base = mkdtempSync(join(tmpdir(), 'vett-fs-safety-'));
    mkdirSync(join(base, 'dir'), { recursive: true });

    const target = join(base, 'target.txt');
    writeFileSync(target, 'real', 'utf-8');

    // base/dir/file.txt -> base/target.txt
    symlinkSync(target, join(base, 'dir', 'file.txt'), 'file');
    expect(() => assertNoSymlinkPathComponents(base, 'dir/file.txt')).toThrow(
      SymlinkTraversalError
    );
  });
});
