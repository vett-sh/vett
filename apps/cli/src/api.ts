import { loadConfig } from './config';
import type { Skill, SkillDetail, SkillVersion } from '@vett/core';

interface SearchResponse {
  skills: Skill[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

function getBaseUrl(): string {
  const config = loadConfig();
  return config.registryUrl;
}

async function fetchJson<T>(path: string): Promise<T> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}${path}`);

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
  });

  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`);
  }

  return {
    url: response.url,
    content: await response.arrayBuffer(),
  };
}
