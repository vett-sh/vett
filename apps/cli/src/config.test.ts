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
