import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./config', () => ({
  loadConfig: () => ({ registryUrl: 'http://test.local' }),
}));

import { getJobStatus, waitForJob } from './api';
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
