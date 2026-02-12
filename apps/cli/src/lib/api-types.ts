/**
 * CLI-owned API response types, inferred from the lenient CLI schemas.
 *
 * These replace the `SkillDetail`, `SkillWithLatestVersion`, `SkillVersion`
 * imports from `@vett/core` in CLI consumer code.
 */
import type { z } from 'zod';
import type {
  apiSkillSchema,
  apiSkillVersionSchema,
  apiSkillDetailSchema,
  apiSkillWithLatestVersionSchema,
  apiSearchVersionSummarySchema,
  apiPaginationSchema,
  apiResolveResponseSchema,
} from './api-schemas';

export type ApiSkill = z.infer<typeof apiSkillSchema>;
export type ApiSkillVersion = z.infer<typeof apiSkillVersionSchema>;
export type ApiSkillDetail = z.infer<typeof apiSkillDetailSchema>;
export type ApiSkillWithLatestVersion = z.infer<typeof apiSkillWithLatestVersionSchema>;
export type ApiSearchVersionSummary = z.infer<typeof apiSearchVersionSummarySchema>;
export type ApiPagination = z.infer<typeof apiPaginationSchema>;
export type ApiResolveResponse = z.infer<typeof apiResolveResponseSchema>;
