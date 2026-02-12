import { loadConfig } from './config';
import { skillManifestSchema } from '@vett/core';
import { computeManifestHash as computeManifestHashCore } from '@vett/core/manifest-hash';
import { createHash } from 'node:crypto';
import { UpgradeRequiredError } from './errors';
import {
  validateSkillDetail,
  validateSkillsListResponse,
  validateResolveResponse,
} from './lib/registry-safety';
import type { SkillManifest } from '@vett/core';
import type {
  ApiSkillWithLatestVersion,
  ApiSkillDetail,
  ApiResolveResponse,
} from './lib/api-types';

/**
 * Error thrown when the API rate limit is exceeded.
 */
export class RateLimitError extends Error {
  constructor(
    public readonly retryAfter: number,
    public readonly limit: number,
    public readonly reset: number
  ) {
    const waitSeconds = Math.ceil(retryAfter);
    super(`Rate limit exceeded. Please wait ${waitSeconds} seconds before retrying.`);
    this.name = 'RateLimitError';
  }
}

declare const __VERSION__: string;

// CLI version for identification headers
const CLI_VERSION = __VERSION__;

export interface JobResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage?: string;
  message?: string;
  hint?: string;
  error?: string;
  slug?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

function getBaseUrl(): string {
  const config = loadConfig();
  return config.registryUrl;
}

function getHeaders(): Record<string, string> {
  return {
    'User-Agent': `vett-cli/${CLI_VERSION}`,
    'X-Vett-Client': 'cli',
    'X-Vett-Version': CLI_VERSION,
  };
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (response.status === 426) {
    const minVersion = response.headers.get('X-Vett-Min-Cli-Version');
    const errorBody = (await response.json().catch(() => null)) as null | {
      error?: string;
      minVersion?: string;
      currentVersion?: string | null;
    };
    const min =
      (errorBody?.minVersion && typeof errorBody.minVersion === 'string'
        ? errorBody.minVersion
        : minVersion) ?? null;
    const current =
      typeof errorBody?.currentVersion === 'string' ? errorBody.currentVersion : CLI_VERSION;
    const msg = `CLI is too old for this registry. Minimum supported: ${min ?? 'unknown'}.`;
    throw new UpgradeRequiredError(msg, min, current);
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
    const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10);
    const reset = parseInt(response.headers.get('X-RateLimit-Reset') || '0', 10);
    throw new RateLimitError(retryAfter, limit, reset);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
      error?: string;
      details?: string;
    };
    const msg =
      (errorBody.error || `HTTP ${response.status}`) +
      (errorBody.details ? `: ${errorBody.details}` : '');
    throw new Error(msg);
  }

  return response.json() as Promise<T>;
}

async function fetchJsonOrNull<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    },
  });

  if (response.status === 426) {
    const minVersion = response.headers.get('X-Vett-Min-Cli-Version');
    const errorBody = (await response.json().catch(() => null)) as null | {
      error?: string;
      minVersion?: string;
      currentVersion?: string | null;
    };
    const min =
      (errorBody?.minVersion && typeof errorBody.minVersion === 'string'
        ? errorBody.minVersion
        : minVersion) ?? null;
    const current =
      typeof errorBody?.currentVersion === 'string' ? errorBody.currentVersion : CLI_VERSION;
    const msg = `CLI is too old for this registry. Minimum supported: ${min ?? 'unknown'}.`;
    throw new UpgradeRequiredError(msg, min, current);
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
    const limit = parseInt(response.headers.get('X-RateLimit-Limit') || '0', 10);
    const reset = parseInt(response.headers.get('X-RateLimit-Reset') || '0', 10);
    throw new RateLimitError(retryAfter, limit, reset);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
      error?: string;
      details?: string;
    };
    const msg =
      (errorBody.error || `HTTP ${response.status}`) +
      (errorBody.details ? `: ${errorBody.details}` : '');
    throw new Error(msg);
  }

  return response.json() as Promise<T>;
}

export async function searchSkills(query?: string): Promise<ApiSkillWithLatestVersion[]> {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  params.set('limit', '20');

  const response = await fetchJson<unknown>(`/api/v1/skills?${params}`);
  return validateSkillsListResponse(response);
}

/**
 * Get full skill detail by slug.
 * The slug contains slashes (e.g. "acme/tools/hello") — NOT encoded,
 * the server uses a catch-all route.
 */
export async function getSkillDetail(slug: string): Promise<ApiSkillDetail | null> {
  const raw = await fetchJsonOrNull<unknown>(`/api/v1/skills/${slug}`);
  if (!raw) return null;
  return validateSkillDetail(raw);
}

/**
 * Find or ingest a skill. Accepts any input the CLI accepts (ref, URL, slug).
 * The server handles lookup, freshness checking, and ingestion.
 */
export async function resolveSkill(input: string): Promise<ApiResolveResponse> {
  const raw = await fetchJson<unknown>('/api/v1/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });
  return validateResolveResponse(raw);
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobResponse> {
  return fetchJson<JobResponse>(`/api/v1/jobs/${jobId}`);
}

/**
 * Poll for job completion
 */
export async function waitForJob(
  jobId: string,
  options: { interval?: number; timeout?: number; onProgress?: (job: JobResponse) => void } = {}
): Promise<JobResponse> {
  const { timeout = 180_000, onProgress } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const job = await getJobStatus(jobId);

    if (onProgress) {
      onProgress(job);
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    // Adaptive polling: 1s for first 30s, then 3s to reduce load during waits
    const elapsed = Date.now() - start;
    const interval = elapsed < 30_000 ? 1_000 : 3_000;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Analysis is taking longer than expected. Your job (ID: ${jobId}) is still processing server-side — try again shortly.`
  );
}

/**
 * Download artifact via the registry download endpoint and verify hash.
 * Routes through `/api/v1/download/{skillId}@{version}` so the server
 * can track install counts.
 */
export async function downloadArtifact(
  skillId: string,
  version: string,
  expectedHash: string
): Promise<ArrayBuffer> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/download/${skillId}@${version}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to download artifact: HTTP ${response.status}`);
  }

  const content = await response.arrayBuffer();
  const text = Buffer.from(content).toString('utf-8');
  let manifestHash: string | null = null;
  try {
    const parsed = JSON.parse(text);
    const manifestResult = skillManifestSchema.safeParse(parsed);
    if (manifestResult.success) {
      manifestHash = computeManifestHashCore(manifestResult.data as SkillManifest);
    }
  } catch {
    // Fall back to raw hash below
  }

  const actualHash = manifestHash ?? computeRawHash(content);
  if (actualHash !== expectedHash) {
    throw new Error(`Hash mismatch! Expected ${expectedHash}, got ${actualHash}`);
  }

  return content;
}

/**
 * Compute SHA256 hash of content
 */
function computeRawHash(content: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(content)).digest('hex');
}
