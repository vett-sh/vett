import { z } from 'zod';

export const SKILL_MANIFEST_SCHEMA_VERSION = 1 as const;

/**
 * Regex for safe file paths:
 * - Must not start with / or \ (absolute paths)
 * - Must not contain .. (parent directory traversal)
 * - Must not contain null bytes
 * - Allows alphanumeric, dots, hyphens, underscores, and forward slashes
 */
const SAFE_PATH_REGEX = /^(?!.*\.\.)(?![/\\])[a-zA-Z0-9._\-/\\]+$/;

/**
 * Validates that a file path is safe (no directory traversal).
 * Used for schema validation.
 */
export function isPathSafe(filePath: string): boolean {
  // Block empty paths
  if (!filePath || filePath.length === 0) return false;

  // Block null bytes
  if (filePath.includes('\0')) return false;

  // Block absolute paths (Unix and Windows)
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false; // Windows drive letters

  // Block parent directory traversal
  if (filePath.includes('..')) return false;

  // Block paths that resolve outside (handles edge cases)
  const segments = filePath.split(/[/\\]/);
  if (segments.some((s) => s === '..')) return false;

  return SAFE_PATH_REGEX.test(filePath);
}

export const skillManifestFileSchema = z.object({
  path: z.string().min(1).refine(isPathSafe, {
    message: 'Invalid file path: must be relative, cannot contain ".." or start with "/" or "\\"',
  }),
  content: z.string(),
  contentType: z.string().min(1).optional(),
});

export const skillManifestSchema = z.object({
  schemaVersion: z.literal(SKILL_MANIFEST_SCHEMA_VERSION),
  entryPoint: z.string().min(1).optional(),
  files: z.array(skillManifestFileSchema).min(1),
});

export type SkillManifestFile = z.infer<typeof skillManifestFileSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;
