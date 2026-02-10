import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config', () => ({
  loadConfig: () => ({ registryUrl: 'http://test.local' }),
}));

import {
  getJobStatus,
  waitForJob,
  getSkillByUrl,
  searchSkills,
  getSkillByRef,
  downloadArtifact,
} from './api';
import { UpgradeRequiredError } from './errors';

function mockFetchWith(response: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(response),
  });
}

describe('waitForJob', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('resolves when job completes', async () => {
    mockFetchWith({ id: 'j1', status: 'complete', createdAt: '2024-01-01T00:00:00Z' });

    const result = await waitForJob('j1');

    expect(result.status).toBe('complete');
  });

  it('resolves when job fails', async () => {
    mockFetchWith({
      id: 'j1',
      status: 'failed',
      error: 'boom',
      createdAt: '2024-01-01T00:00:00Z',
    });

    const result = await waitForJob('j1');

    expect(result.status).toBe('failed');
  });

  it('throws with job ID in timeout error message', async () => {
    mockFetchWith({ id: 'job-abc-123', status: 'pending', createdAt: '2024-01-01T00:00:00Z' });

    const promise = waitForJob('job-abc-123', { timeout: 5_000 });
    // Attach a no-op catch immediately to prevent unhandled rejection warnings
    // while we advance timers — the real assertion happens below.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(6_000);

    await expect(promise).rejects.toThrow(/job-abc-123.*still processing server-side/s);
  });
});

describe('upgrade required (426)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws UpgradeRequiredError with min version from response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 426,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'x-vett-min-cli-version' ? '0.2.1' : null),
      },
      json: () => Promise.resolve({ error: 'Upgrade required', minVersion: '0.2.1' }),
    });

    await expect(getJobStatus('job-1')).rejects.toBeInstanceOf(UpgradeRequiredError);
    await expect(getJobStatus('job-1')).rejects.toMatchObject({ minVersion: '0.2.1' });
  });
});

describe('registry response validation', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects unsafe path segments in skill identity', async () => {
    mockFetchWith({
      id: '11111111-1111-1111-1111-111111111111',
      owner: '../evil',
      repo: null,
      name: 'ok',
      description: null,
      sourceUrl: null,
      installCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      versions: [],
    });

    await expect(getSkillByUrl('https://example.com/skill')).rejects.toThrow(/invalid response/i);
  });

  it('accepts valid skill detail via getSkillByUrl', async () => {
    mockFetchWith({
      id: '11111111-1111-1111-1111-111111111111',
      owner: 'acme',
      repo: 'tools',
      name: 'hello',
      description: null,
      sourceUrl: null,
      installCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      versions: [],
    });

    const result = await getSkillByUrl('https://example.com/skill');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('acme');
  });
});

describe('searchSkills', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts valid skills list response', async () => {
    mockFetchWith({
      skills: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          owner: 'acme',
          repo: 'tools',
          name: 'hello',
          description: null,
          sourceUrl: null,
          installCount: 0,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          latestVersion: null,
        },
      ],
    });

    const result = await searchSkills('hello');
    expect(result).toHaveLength(1);
    expect(result[0].owner).toBe('acme');
  });

  it('rejects poisoned owner in skills list', async () => {
    mockFetchWith({
      skills: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          owner: '../evil',
          repo: null,
          name: 'hello',
          description: null,
          sourceUrl: null,
          installCount: 0,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          latestVersion: null,
        },
      ],
    });

    await expect(searchSkills('hello')).rejects.toThrow(/invalid response/i);
  });

  it('rejects missing skills key', async () => {
    mockFetchWith({ data: [] });

    await expect(searchSkills('hello')).rejects.toThrow(/invalid response/i);
  });
});

describe('getSkillByRef', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts valid response', async () => {
    mockFetchWith({
      id: '11111111-1111-1111-1111-111111111111',
      owner: 'acme',
      repo: 'tools',
      name: 'hello',
      description: null,
      sourceUrl: null,
      installCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      versions: [],
    });

    const result = await getSkillByRef('acme', 'tools', 'hello');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('hello');
  });

  it('returns null on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: () => null,
      },
      json: () => Promise.resolve({ error: 'Not found' }),
    });

    const result = await getSkillByRef('acme', 'tools', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('downloadArtifact', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects http:// artifact URLs', async () => {
    await expect(
      downloadArtifact('http://cdn.example.com/artifact.json', 'a'.repeat(64))
    ).rejects.toThrow(/https:/);
  });

  it('rejects file:// artifact URLs', async () => {
    await expect(downloadArtifact('file:///etc/passwd', 'a'.repeat(64))).rejects.toThrow(/https:/);
  });
});
