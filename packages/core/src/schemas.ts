import { z } from 'zod';
import {
  PERMISSION_TYPES,
  ACCESS_LEVELS,
  SCAN_STATUSES,
  SCAN_ENGINES,
  SKILL_SOURCES,
  RISK_LEVELS,
} from './constants.js';

export const skillSchema = z.object({
  id: z.string().uuid(),
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable(),
  source: z.enum(SKILL_SOURCES),
  installCount: z.number().int().min(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const skillVersionSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().uuid(),
  version: z.string().min(1).max(50),
  hash: z.string().length(64),
  artifactUrl: z.string().url(),
  size: z.number().int().min(0),
  scannedAt: z.coerce.date().nullable(),
  scanStatus: z.enum(SCAN_STATUSES),
  createdAt: z.coerce.date(),
});

export const permissionSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  type: z.enum(PERMISSION_TYPES),
  access: z.enum(ACCESS_LEVELS),
  details: z.string().max(500).nullable(),
});

export const scanFindingSchema = z.object({
  rule: z.string(),
  severity: z.enum(RISK_LEVELS),
  message: z.string(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  snippet: z.string().optional(),
});

export const scanSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  engine: z.enum(SCAN_ENGINES),
  status: z.enum(SCAN_STATUSES),
  findings: z.array(scanFindingSchema),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

// Query schemas
export const searchQuerySchema = z.object({
  q: z.string().optional(),
  source: z.enum(SKILL_SOURCES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const skillIdentifierSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  skill: z.string().min(1),
});

export const skillRefSchema = z.string().regex(
  /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(@[a-zA-Z0-9._-]+)?$/,
  'Invalid skill reference. Format: owner/repo/skill[@version]'
);

// Type exports from schemas
export type SkillInput = z.infer<typeof skillSchema>;
export type SkillVersionInput = z.infer<typeof skillVersionSchema>;
export type PermissionInput = z.infer<typeof permissionSchema>;
export type ScanInput = z.infer<typeof scanSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
