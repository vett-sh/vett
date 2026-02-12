import { z } from 'zod';
import { SCAN_STATUSES, RISK_LEVELS } from './constants';

export const skillSchema = z.object({
  id: z.string().uuid(),
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable(),
  installCount: z.number().int().min(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const skillVersionSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().uuid(),
  version: z.string().min(1).max(50),
  hash: z.string().length(64),

  size: z.number().int().min(0),
  risk: z.enum(RISK_LEVELS).nullable(),
  summary: z.string().nullable(),
  analysis: z.unknown().nullable(), // Full AnalysisResult, validated by scanner
  gitRef: z.string().max(255).nullable(),
  commitSha: z.string().length(40).nullable(),
  sourceFingerprint: z.string().max(64).nullable(),
  sigstoreBundle: z.unknown().nullable(),
  analyzedAt: z.coerce.date().nullable(),
  scanStatus: z.enum(SCAN_STATUSES),
  createdAt: z.coerce.date(),
});

// Sort options for skills search
export const SORT_OPTIONS = ['installs', 'trending', 'newest'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

// Query schemas
export const searchQuerySchema = z.object({
  q: z.string().optional(),
  risk: z
    .string()
    .optional()
    .transform((v) => v?.split(',') as (typeof RISK_LEVELS)[number][] | undefined)
    .refine(
      (v) => !v || v.every((r) => (RISK_LEVELS as readonly string[]).includes(r)),
      'Invalid risk level'
    ),
  sortBy: z.enum(SORT_OPTIONS).optional().default('installs'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const skillIdentifierSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  skill: z.string().min(1),
});

export const skillRefSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(@[a-zA-Z0-9._-]+)?$/,
    'Invalid skill reference. Format: owner/repo/skill[@version]'
  );

// Type exports from schemas
export type SkillInput = z.infer<typeof skillSchema>;
export type SkillVersionInput = z.infer<typeof skillVersionSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// ---------------------------------------------------------------------------
// Path safety utilities
// Used by the CLI to validate untrusted registry responses before constructing
// filesystem paths (~/.vett/skills/<owner>/<repo>/<name>).
// ---------------------------------------------------------------------------

/**
 * Returns true when `value` is safe to use as a single filesystem path segment.
 * Uses a positive allowlist: alphanumeric, hyphen, underscore, dot.
 * Rejects traversal sequences, Windows-reserved chars, shell metacharacters, etc.
 */
export function isSafePathSegment(value: string): boolean {
  if (!value) return false;
  if (value === '.' || value === '..') return false;
  if (value.includes('..')) return false;
  // Positive allowlist — covers GitHub/GitLab identifiers while rejecting
  // Windows-reserved chars (<>:"|?*), shell metacharacters, slashes, etc.
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return false;
  return true;
}

export const safePathSegmentSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(isSafePathSegment, 'Value is not a safe path segment');
