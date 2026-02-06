import { z } from 'zod';

export const SKILL_MANIFEST_SCHEMA_VERSION = 1 as const;

export const DEFAULT_MAX_SKILL_FILE_BYTES = 256 * 1024; // 256 KiB
export const DEFAULT_MAX_SKILL_TOTAL_BYTES = 1024 * 1024; // 1 MiB

export interface SkillSizeLimits {
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_SKILL_SIZE_LIMITS: SkillSizeLimits = {
  maxFileBytes: DEFAULT_MAX_SKILL_FILE_BYTES,
  maxTotalBytes: DEFAULT_MAX_SKILL_TOTAL_BYTES,
};

export function utf8ByteLength(value: string): number {
  // TextEncoder is available in Node >= 11 and all modern browsers.
  return new TextEncoder().encode(value).length;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function createSkillManifestFileSchemaInternal(
  limits: SkillSizeLimits,
  options: { validateSize: boolean }
) {
  return z
    .object({
      path: z.string().min(1).refine(isPathSafe, {
        message:
          'Invalid file path: must be relative, cannot contain ".." or start with "/" or "\\"',
      }),
      content: z.string(),
      contentType: z.string().min(1).optional(),
    })
    .superRefine((file, ctx) => {
      if (!options.validateSize) return;

      const size = utf8ByteLength(file.content);
      if (size > limits.maxFileBytes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message:
            `File "${file.path}" content is too large: ` +
            `${formatByteSize(size)} (${size} bytes) > ` +
            `${formatByteSize(limits.maxFileBytes)} (${limits.maxFileBytes} bytes)`,
        });
      }
    });
}

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

/**
 * Validates a single manifest file object.
 *
 * Note: total-bytes limits are validated at the manifest level via createSkillManifestSchema().
 */
export function createSkillManifestFileSchema(limits: SkillSizeLimits = DEFAULT_SKILL_SIZE_LIMITS) {
  return createSkillManifestFileSchemaInternal(limits, { validateSize: true });
}

export function createSkillManifestSchema(limits: SkillSizeLimits = DEFAULT_SKILL_SIZE_LIMITS) {
  const fileSchema = createSkillManifestFileSchemaInternal(limits, { validateSize: false });
  return z
    .object({
      schemaVersion: z.literal(SKILL_MANIFEST_SCHEMA_VERSION),
      entryPoint: z.string().min(1).optional(),
      files: z.array(fileSchema).min(1),
    })
    .superRefine((manifest, ctx) => {
      let totalBytes = 0;
      for (let i = 0; i < manifest.files.length; i++) {
        const file = manifest.files[i]!;
        const bytes = utf8ByteLength(file.content);
        totalBytes += bytes;
        if (bytes > limits.maxFileBytes) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['files', i, 'content'],
            message:
              `File "${file.path}" content is too large: ` +
              `${formatByteSize(bytes)} (${bytes} bytes) > ` +
              `${formatByteSize(limits.maxFileBytes)} (${limits.maxFileBytes} bytes)`,
          });
        }
      }
      if (totalBytes > limits.maxTotalBytes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['files'],
          message:
            `Skill manifest is too large: ` +
            `${formatByteSize(totalBytes)} (${totalBytes} bytes) > ` +
            `${formatByteSize(limits.maxTotalBytes)} (${limits.maxTotalBytes} bytes)`,
        });
      }
    });
}

export const skillManifestFileSchema = createSkillManifestFileSchema();
export const skillManifestSchema = createSkillManifestSchema();

export type SkillManifestFile = z.infer<typeof skillManifestFileSchema>;
export type SkillManifest = z.infer<typeof skillManifestSchema>;

export function computeSkillManifestSize(manifest: SkillManifest): number {
  return manifest.files.reduce((sum, f) => sum + utf8ByteLength(f.content), 0);
}
