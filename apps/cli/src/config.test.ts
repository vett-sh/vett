import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ORIGINAL_HOME = process.env.HOME;

let tempHome = '';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function loadConfigModule() {
  vi.resetModules();
  return await import('./config');
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'vett-config-'));
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
  }
});

describe('config storage', () => {
  it('writes schemaVersion to config.json', async () => {
    const { loadConfig } = await loadConfigModule();
    loadConfig();

    const configPath = join(tempHome, '.vett', 'config.json');
    const data = readJson(configPath) as { schemaVersion?: number };

    expect(data.schemaVersion).toBe(1);
  });

  it('defaults telemetry.enabled to true', async () => {
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();

    expect(config.telemetry.enabled).toBe(true);
  });

  it('respects telemetry env override', async () => {
    process.env.VETT_TELEMETRY_ENABLED = 'false';
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();

    expect(config.telemetry.enabled).toBe(false);
    delete process.env.VETT_TELEMETRY_ENABLED;
  });

  it('writes schemaVersion to index.json', async () => {
    const { loadIndex } = await loadConfigModule();
    loadIndex();

    const indexPath = join(tempHome, '.vett', 'index.json');
    const data = readJson(indexPath) as { schemaVersion?: number };

    expect(data.schemaVersion).toBe(1);
  });

  it('migrates legacy installedSkills from config.json to index.json', async () => {
    const configDir = join(tempHome, '.vett');
    mkdirSync(configDir, { recursive: true });

    const legacySkill = {
      owner: 'acme',
      repo: 'tools',
      name: 'commit',
      version: '1.0.0',
      installedAt: new Date('2026-01-01T00:00:00.000Z'),
      path: '/tmp/skills/acme/tools/commit',
    };

    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify(
        {
          installDir: '/tmp/skills',
          registryUrl: 'https://example.com',
          installedSkills: [legacySkill],
        },
        null,
        2
      )
    );

    const { loadIndex } = await loadConfigModule();
    const index = loadIndex();

    expect(index.installedSkills).toHaveLength(1);
    expect(index.installedSkills[0]?.name).toBe('commit');

    const migratedConfig = readJson(join(configDir, 'config.json')) as Record<string, unknown>;
    expect(migratedConfig.schemaVersion).toBe(1);
    expect(migratedConfig.installedSkills).toBeUndefined();
  });

  it('addInstalledSkill updates index.json only', async () => {
    const { addInstalledSkill, loadIndex } = await loadConfigModule();

    addInstalledSkill({
      owner: 'acme',
      repo: 'tools',
      name: 'commit',
      version: '2.0.0',
      installedAt: new Date('2026-02-04T00:00:00.000Z'),
      path: '/tmp/skills/acme/tools/commit',
    });

    const index = loadIndex();
    expect(index.installedSkills).toHaveLength(1);

    const configPath = join(tempHome, '.vett', 'config.json');
    if (existsSync(configPath)) {
      const config = readJson(configPath) as Record<string, unknown>;
      expect(config.installedSkills).toBeUndefined();
    }
  });

  it('generates a deviceId on first load', async () => {
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();

    expect(config.telemetry.deviceId).toBeDefined();
    expect(config.telemetry.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('persists deviceId to config.json', async () => {
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();

    const configPath = join(tempHome, '.vett', 'config.json');
    const data = readJson(configPath) as { telemetry?: { deviceId?: string } };

    expect(data.telemetry?.deviceId).toBe(config.telemetry.deviceId);
  });

  it('returns the same deviceId on subsequent loads', async () => {
    const { loadConfig } = await loadConfigModule();
    const first = loadConfig();
    const second = loadConfig();

    expect(second.telemetry.deviceId).toBe(first.telemetry.deviceId);
  });

  it('replaces invalid deviceId with a new UUID', async () => {
    const configDir = join(tempHome, '.vett');
    mkdirSync(configDir, { recursive: true });

    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        installDir: join(tempHome, '.vett', 'skills'),
        registryUrl: 'https://vett.sh',
        telemetry: { enabled: true, deviceId: 'not-a-uuid' },
      })
    );

    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();

    expect(config.telemetry.deviceId).not.toBe('not-a-uuid');
    expect(config.telemetry.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('preserves a valid deviceId from existing config', async () => {
    const configDir = join(tempHome, '.vett');
    mkdirSync(configDir, { recursive: true });

    const existingId = '550e8400-e29b-41d4-a716-446655440000';
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        installDir: join(tempHome, '.vett', 'skills'),
        registryUrl: 'https://vett.sh',
        telemetry: { enabled: true, deviceId: existingId },
      })
    );

    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();

    expect(config.telemetry.deviceId).toBe(existingId);
  });

  it('getDeviceId returns the generated deviceId', async () => {
    const { loadConfig, getDeviceId } = await loadConfigModule();
    const config = loadConfig();

    expect(getDeviceId()).toBe(config.telemetry.deviceId);
  });

  it('clears stale lock files', async () => {
    const { saveConfig } = await loadConfigModule();

    const configDir = join(tempHome, '.vett');
    mkdirSync(configDir, { recursive: true });

    const lockPath = join(configDir, 'config.json.lock');
    writeFileSync(lockPath, 'stale');
    const staleTime = new Date(Date.now() - 60_000);
    utimesSync(lockPath, staleTime, staleTime);

    saveConfig({
      schemaVersion: 1,
      installDir: '/tmp/skills',
      registryUrl: 'https://example.com',
      telemetry: {
        enabled: true,
      },
    });

    const configPath = join(configDir, 'config.json');
    const config = readJson(configPath) as Record<string, unknown>;
    expect(config.schemaVersion).toBe(1);
  });
});
