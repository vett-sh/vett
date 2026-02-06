import { existsSync, lstatSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export class SymlinkTraversalError extends Error {
  constructor(public readonly path: string) {
    super(`Symlink traversal detected: "${path}"`);
    this.name = 'SymlinkTraversalError';
  }
}

function splitPathComponents(p: string): string[] {
  // Manifests use POSIX paths; Windows can receive either kind. Normalize to components.
  return p.split(/[\\/]+/).filter((s) => s.length > 0 && s !== '.');
}

/**
 * Guards against pre-existing symlinks inside an install directory.
 *
 * Policy: if any *existing* path component under `baseDir` is a symlink, fail the install.
 * This prevents writes that would escape the intended directory via symlink traversal.
 */
export function assertNoSymlinkPathComponents(baseDir: string, relativePath: string): void {
  const base = resolve(baseDir);
  const segments = splitPathComponents(relativePath);

  let current = base;
  for (const seg of segments) {
    current = resolve(current, seg);

    // Only check components that already exist on disk.
    if (!existsSync(current)) continue;

    const st = lstatSync(current);
    if (st.isSymbolicLink()) {
      throw new SymlinkTraversalError(current);
    }
  }

  // Also check every existing parent directory on the path (e.g., for empty relativePath).
  // This is a cheap defense-in-depth check; `current` is already a resolved child path.
  if (base !== current && !current.startsWith(base + sep)) {
    // Should never happen if upstream path-within-base checks are correct.
    throw new SymlinkTraversalError(current);
  }
}
