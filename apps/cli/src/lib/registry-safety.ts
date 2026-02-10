import { apiSkillDetailSchema, apiSkillsListResponseSchema } from '@vett/core';
import type { SkillDetail, SkillWithLatestVersion } from '@vett/core';

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

export function validateSkillDetail(raw: unknown): SkillDetail {
  const result = apiSkillDetailSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error.issues));
  }
  return result.data as unknown as SkillDetail;
}

export function validateSkillsListResponse(raw: unknown): SkillWithLatestVersion[] {
  const result = apiSkillsListResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatZodIssues(result.error.issues));
  }
  return result.data.skills as unknown as SkillWithLatestVersion[];
}

export function assertHttpsUrl(url: string, context: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${context} URL is malformed.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${context} URL must use https: scheme, got ${parsed.protocol}`);
  }
}
