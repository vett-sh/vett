import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ORIGINAL_HOME = process.env.HOME;

let tempHome = '';

async function loadModule() {
  vi.resetModules();
  return await import('./update-notifier');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'vett-update-'));
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  if (tempHome) rmSync(tempHome, { recursive: true, force: true });
});

describe('update notifier cache', () => {
  it('uses cache when fresh', async () => {
    const { checkForUpdates } = await loadModule();
    const cachePath = join(tempHome, '.vett', 'update.json');

    const now = 1_000_000;
    const currentVersion = '1.0.0';

    // Seed cache via a first "network" run.
    const first = await checkForUpdates({
      currentVersion,
      cachePath,
      nowMs: now,
      intervalMs: 24 * 60 * 60 * 1000,
      fetchLatest: async () => '1.2.0',
    });
    expect(first.source).toBe('network');

    const second = await checkForUpdates({
      currentVersion,
      cachePath,
      nowMs: now + 60_000,
      intervalMs: 24 * 60 * 60 * 1000,
      fetchLatest: async () => '9.9.9',
    });

    expect(second.source).toBe('cache');
    expect(second.latest).toBe('1.2.0');
    expect(second.updateAvailable).toBe(true);
  });

  it('refreshes cache when stale', async () => {
    const { checkForUpdates } = await loadModule();
    const cachePath = join(tempHome, '.vett', 'update.json');

    const intervalMs = 10_000;
    const now = 1_000_000;

    await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath,
      nowMs: now,
      intervalMs,
      fetchLatest: async () => '1.1.0',
    });

    const res = await checkForUpdates({
      currentVersion: '1.0.0',
      cachePath,
      nowMs: now + intervalMs + 1,
      intervalMs,
      fetchLatest: async () => '1.3.0',
    });

    expect(res.source).toBe('network');
    expect(res.latest).toBe('1.3.0');
    expect(res.updateAvailable).toBe(true);

    const stored = readJson(cachePath) as { latest?: string };
    expect(stored.latest).toBe('1.3.0');
  });

  it('does not mark update available when latest <= current', async () => {
    const { checkForUpdates } = await loadModule();
    const res = await checkForUpdates({
      currentVersion: '2.0.0',
      cachePath: join(tempHome, '.vett', 'update.json'),
      nowMs: 1234,
      fetchLatest: async () => '2.0.0',
    });
    expect(res.updateAvailable).toBe(false);
  });
});
