/**
 * CLI-owned API response schemas.
 *
 * These are lenient versions of the registry response shapes: non-essential
 * fields are optional (with sensible defaults) so the CLI doesn't break when
 * the server adds or omits fields.  All schemas use `.passthrough()` for
 * forward compatibility.
 *
 * Security-critical validation (path safety, HTTPS enforcement) is preserved.
 */
import { z } from 'zod';
import { safePathSegmentSchema, RISK_LEVELS, SCAN_STATUSES } from '@vett/core';

export const apiSkillSchema = z
  .object({
    // Required — canonical identifier
    slug: z.string().min(1),

    // Required — used for filesystem path construction
    owner: safePathSegmentSchema,
    repo: safePathSegmentSchema.nullable(),
    name: safePathSegmentSchema,

    // Optional — not needed for core CLI operations
    id: z.string().uuid().optional(),
    description: z.string().max(1000).nullable().optional().default(null),
    sourceUrl: z.string().nullable().optional().default(null),
    installCount: z.number().int().min(0).optional().default(0),
    createdAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .passthrough();

export const apiSkillVersionSchema = z
  .object({
    // Required — download & verify
    version: z.string().min(1).max(50),
    hash: z.string().length(64),
    // Required — security verification
    risk: z.enum(RISK_LEVELS).nullable(),
    analysis: z.unknown().nullable(),
    sigstoreBundle: z.unknown().nullable(),

    // Optional — informational
    id: z.string().uuid().optional(),
    skillId: z.string().uuid().optional(),
    size: z.number().int().min(0).optional().default(0),
    summary: z.string().nullable().optional().default(null),
    gitRef: z.string().max(255).nullable().optional().default(null),
    commitSha: z.string().length(40).nullable().optional().default(null),
    sourceUrl: z.string().nullable().optional().default(null),
    sourceFingerprint: z.string().max(64).nullable().optional().default(null),
    analyzedAt: z.coerce.date().nullable().optional().default(null),
    scanStatus: z.enum(SCAN_STATUSES).optional().default('pending'),
    createdAt: z.coerce.date().optional(),
  })
  .passthrough();

/** Lightweight version summary used in search results */
export const apiSearchVersionSummarySchema = z
  .object({
    version: z.string().min(1).max(50),
    risk: z.enum(RISK_LEVELS).nullable(),
    scanStatus: z.enum(SCAN_STATUSES).optional().default('pending'),
  })
  .passthrough();

export const apiSkillDetailSchema = apiSkillSchema.extend({
  versions: z.array(apiSkillVersionSchema),
});

/** Search result: skill with a lightweight latestVersion summary */
export const apiSkillWithLatestVersionSchema = apiSkillSchema.extend({
  latestVersion: apiSearchVersionSummarySchema.nullable(),
});

export const apiPaginationSchema = z
  .object({
    limit: z.number().int().min(0),
    offset: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .passthrough();

export const apiSkillsListResponseSchema = z
  .object({
    skills: z.array(apiSkillWithLatestVersionSchema),
    pagination: apiPaginationSchema.optional(),
  })
  .passthrough();

/**
 * Resolve response — discriminated union on `status`.
 * - `ready`: skill exists and is fresh, full detail included
 * - `processing`: ingestion started, poll jobId
 * - `not_found`: skill/version not found
 */
export const apiResolveResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ready'),
      skill: apiSkillDetailSchema,
    })
    .passthrough(),
  z
    .object({
      status: z.literal('processing'),
      jobId: z.string().min(1),
      slug: z.string().min(1).optional(),
    })
    .passthrough(),
  z
    .object({
      status: z.literal('not_found'),
      message: z.string().optional().default('Skill not found'),
    })
    .passthrough(),
]);
