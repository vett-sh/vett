import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config', () => ({
  loadConfig: () => ({ registryUrl: 'http://test.local' }),
}));

import {
  getJobStatus,
  waitForJob,
  searchSkills,
  getSkillDetail,
  resolveSkill,
  downloadArtifact,
} from './api';
import { UpgradeRequiredError } from './errors';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_SHA = 'a'.repeat(64);
const VALID_COMMIT_SHA = 'b'.repeat(40);

function mockFetchWith(response: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(response),
  });
}

function makeSkillDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    slug: 'acme/tools/hello',
    owner: 'acme',
    repo: 'tools',
    name: 'hello',
    description: null,
    sourceUrl: null,
    installCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    versions: [],
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    hash: VALID_SHA,
    size: 1024,
    risk: 'low',
    summary: 'test',
    analysis: null,
    gitRef: 'main',
    commitSha: VALID_COMMIT_SHA,
    sourceFingerprint: null,
    sigstoreBundle: null,
    analyzedAt: null,
    scanStatus: 'completed',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
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
    mockFetchWith({ id: 'j1', status: 'completed', createdAt: '2024-01-01T00:00:00Z' });

    const result = await waitForJob('j1');

    expect(result.status).toBe('completed');
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

describe('getSkillDetail', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts valid skill detail response', async () => {
    mockFetchWith(makeSkillDetail({ versions: [makeVersion()] }));

    const result = await getSkillDetail('acme/tools/hello');
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('acme/tools/hello');
    expect(result!.versions).toHaveLength(1);
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

    const result = await getSkillDetail('acme/tools/nonexistent');
    expect(result).toBeNull();
  });

  it('rejects unsafe path segments in response', async () => {
    mockFetchWith(makeSkillDetail({ owner: '../evil' }));

    await expect(getSkillDetail('acme/tools/hello')).rejects.toThrow(/invalid response/i);
  });

  it('uses slug as literal path (not encoded)', async () => {
    mockFetchWith(makeSkillDetail());

    await getSkillDetail('acme/tools/hello');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test.local/api/v1/skills/acme/tools/hello',
      expect.anything()
    );
  });
});

describe('resolveSkill', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts ready response', async () => {
    mockFetchWith({
      status: 'ready',
      skill: makeSkillDetail({ versions: [makeVersion()] }),
    });

    const result = await resolveSkill('acme/tools/hello');
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.skill.slug).toBe('acme/tools/hello');
    }
  });

  it('accepts processing response', async () => {
    mockFetchWith({
      status: 'processing',
      jobId: 'job-123',
      slug: 'acme/tools/hello',
    });

    const result = await resolveSkill('https://github.com/acme/tools/tree/main/hello');
    expect(result.status).toBe('processing');
    if (result.status === 'processing') {
      expect(result.jobId).toBe('job-123');
    }
  });

  it('accepts not_found response', async () => {
    mockFetchWith({
      status: 'not_found',
      message: 'Version 1.2.0 not found',
    });

    const result = await resolveSkill('acme/tools/hello@1.2.0');
    expect(result.status).toBe('not_found');
  });

  it('sends POST with input in body', async () => {
    mockFetchWith({ status: 'not_found', message: 'Not found' });

    await resolveSkill('acme/tools/hello');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test.local/api/v1/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ input: 'acme/tools/hello' }),
      })
    );
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
          id: VALID_UUID,
          slug: 'acme/tools/hello',
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
    expect(result[0].slug).toBe('acme/tools/hello');
  });

  it('rejects poisoned owner in skills list', async () => {
    mockFetchWith({
      skills: [
        {
          id: VALID_UUID,
          slug: '../evil/hello',
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

describe('downloadArtifact', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('constructs download URL from skillId and version', async () => {
    const content = Buffer.from('test-content');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(content.buffer.slice(0)),
    });

    // Hash won't match — we just need to verify the URL construction
    await downloadArtifact(VALID_UUID, '1.0.0', 'a'.repeat(64)).catch(() => {});

    expect(global.fetch).toHaveBeenCalledWith(
      `http://test.local/api/v1/download/${VALID_UUID}@1.0.0`,
      expect.anything()
    );
  });

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(downloadArtifact(VALID_UUID, '1.0.0', 'a'.repeat(64))).rejects.toThrow(/HTTP 500/);
  });
});
