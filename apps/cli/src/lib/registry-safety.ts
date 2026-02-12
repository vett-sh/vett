import {
  apiSkillDetailSchema,
  apiSkillsListResponseSchema,
  apiResolveResponseSchema,
} from './api-schemas';
import type { ApiSkillDetail, ApiSkillWithLatestVersion, ApiResolveResponse } from './api-types';

interface ZodIssue {
  path: (string | number)[];
}

function formatZodIssues(issues: ZodIssue[]): string {
  const paths = issues.map((i) => i.path.join('.')).filter(Boolean);
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length > 0) {
    return `Registry returned an invalid response (invalid fields: ${uniquePaths.join(', ')}).`;
  }
  return 'Registry returned an invalid response.';
}

export function validateSkillDetail(raw: unknown): ApiSkillDetail {
  const result = apiSkillDetailSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error.issues));
  }
  return result.data;
}

export function validateSkillsListResponse(raw: unknown): ApiSkillWithLatestVersion[] {
  const result = apiSkillsListResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error.issues));
  }
  return result.data.skills;
}

export function validateResolveResponse(raw: unknown): ApiResolveResponse {
  const result = apiResolveResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error.issues));
  }
  return result.data;
}
