import { z } from 'zod';

export const SKILL_MANIFEST_SCHEMA_VERSION = 1 as const;

export const skillManifestFileSchema = z.object({
  path: z.string().min(1),
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
