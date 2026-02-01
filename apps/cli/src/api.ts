import { createHash } from 'node:crypto';
import { loadConfig } from './config';
import type { Skill, SkillDetail, SkillVersion, AnalysisResult } from '@vett/core';

// CLI version for identification headers
const CLI_VERSION = '0.1.0';

interface SearchResponse {
  skills: Skill[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

// Ingest API types
export interface IngestResponse {
  jobId: string;
  status: string;
  skillId: string;
}

export interface JobResponse {
  id: string;
  url: string;
  skillId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: {
    skill: {
      id: string;
      owner: string;
      repo: string;
      name: string;
      description: string | null;
      source: string;
      sourceUrl: string | null;
    };
    version: {
      id: string;
      version: string;
      hash: string;
      artifactUrl: string;
      size: number;
      risk: string | null;
      summary: string | null;
      analysis: AnalysisResult | null;
    };
  };
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

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
      error?: string;
    };
    throw new Error(errorBody.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function searchSkills(query?: string): Promise<Skill[]> {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  params.set('limit', '20');

  const response = await fetchJson<SearchResponse>(`/api/v1/skills?${params}`);
  return response.skills;
}

export async function getSkillByRef(
  owner: string,
  repo: string,
  name: string
): Promise<SkillDetail | null> {
  // First search for the skill to get its ID
  const skills = await searchSkills(`${owner}/${repo}/${name}`);
  const skill = skills.find((s) => s.owner === owner && s.repo === repo && s.name === name);

  if (!skill) {
    return null;
  }

  return fetchJson<SkillDetail>(`/api/v1/skills/${skill.id}`);
}

export async function getVersion(skillId: string, version: string): Promise<SkillVersion> {
  return fetchJson<SkillVersion>(`/api/v1/skills/${skillId}/versions/${version}`);
}

export async function downloadSkill(
  skillId: string,
  version?: string
): Promise<{ url: string; content: ArrayBuffer }> {
  const baseUrl = getBaseUrl();
  const ref = version ? `${skillId}@${version}` : skillId;
  const response = await fetch(`${baseUrl}/api/v1/download/${encodeURIComponent(ref)}`, {
    redirect: 'follow',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`);
  }

  return {
    url: response.url,
    content: await response.arrayBuffer(),
  };
}

/**
 * Submit a URL for ingestion
 */
export async function ingestSkill(url: string): Promise<IngestResponse> {
  return fetchJson<IngestResponse>('/api/v1/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
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
  options: { interval?: number; timeout?: number; onProgress?: (status: string) => void } = {}
): Promise<JobResponse> {
  const { interval = 1000, timeout = 120000, onProgress } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const job = await getJobStatus(jobId);

    if (onProgress) {
      onProgress(job.status);
    }

    if (job.status === 'complete' || job.status === 'failed') {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Job timed out');
}

/**
 * Download artifact and verify hash
 */
export async function downloadArtifact(
  artifactUrl: string,
  expectedHash: string
): Promise<ArrayBuffer> {
  const response = await fetch(artifactUrl, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to download artifact: HTTP ${response.status}`);
  }

  const content = await response.arrayBuffer();

  // Verify hash
  const actualHash = computeHash(content);
  if (actualHash !== expectedHash) {
    throw new Error(`Hash mismatch! Expected ${expectedHash}, got ${actualHash}`);
  }

  return content;
}

/**
 * Compute SHA256 hash of content
 */
function computeHash(content: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(content)).digest('hex');
}
