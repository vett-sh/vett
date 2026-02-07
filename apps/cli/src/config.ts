import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
  renameSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { VettConfig, VettIndex, InstalledSkill } from '@vett/core';

const CONFIG_DIR = join(homedir(), '.vett');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CONFIG_LOCK = join(CONFIG_DIR, 'config.json.lock');
const INDEX_FILE = join(CONFIG_DIR, 'index.json');
const INDEX_LOCK = join(CONFIG_DIR, 'index.json.lock');
const SKILLS_DIR = join(CONFIG_DIR, 'skills');

const CONFIG_SCHEMA_VERSION = 1;
const INDEX_SCHEMA_VERSION = 1;

function getDefaultRegistryUrl(): string {
  return process.env.VETT_REGISTRY_URL || 'https://vett.sh';
}

const DEFAULT_CONFIG: VettConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  installDir: SKILLS_DIR,
  registryUrl: getDefaultRegistryUrl(),
  telemetry: {
    enabled: true,
  },
};

const DEFAULT_INDEX: VettIndex = {
  schemaVersion: INDEX_SCHEMA_VERSION,
  installedSkills: [],
};

function sleepMs(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function withFileLock<T>(lockPath: string, fn: () => T): T {
  const timeoutMs = 2500;
  const retryMs = 50;
  const staleMs = 10_000;
  const startedAt = Date.now();

  while (true) {
    try {
      const fd = openSync(lockPath, 'wx');
      closeSync(fd);
      break;
    } catch {
      try {
        const stats = statSync(lockPath);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > staleMs) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        // Ignore stat/unlink errors and retry
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for lock: ${lockPath}`);
      }
      sleepMs(retryMs);
    }
  }

  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // Best effort cleanup
    }
  }
}

function writeJsonAtomic(path: string, data: unknown): void {
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, path);
}

function readJsonFile(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEnvBool(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function normalizeConfig(raw: unknown): {
  config: VettConfig;
  legacyInstalledSkills?: InstalledSkill[];
  changed: boolean;
} {
  let changed = false;
  let legacyInstalledSkills: InstalledSkill[] | undefined;

  if (!isRecord(raw)) {
    return {
      config: {
        ...DEFAULT_CONFIG,
        telemetry: { ...DEFAULT_CONFIG.telemetry, deviceId: randomUUID() },
      },
      changed: true,
    };
  }

  if (Array.isArray(raw.installedSkills)) {
    legacyInstalledSkills = raw.installedSkills as InstalledSkill[];
    changed = true;
  }

  const schemaVersion =
    typeof raw.schemaVersion === 'number' ? raw.schemaVersion : CONFIG_SCHEMA_VERSION - 1;
  if (schemaVersion !== CONFIG_SCHEMA_VERSION) changed = true;

  const installDir =
    typeof raw.installDir === 'string' ? raw.installDir : DEFAULT_CONFIG.installDir;
  if (raw.installDir !== undefined && typeof raw.installDir !== 'string') changed = true;

  const registryUrl =
    typeof raw.registryUrl === 'string' ? raw.registryUrl : DEFAULT_CONFIG.registryUrl;
  if (raw.registryUrl !== undefined && typeof raw.registryUrl !== 'string') changed = true;

  let telemetryEnabled = DEFAULT_CONFIG.telemetry.enabled;
  let deviceId: string | undefined;
  if (isRecord(raw.telemetry)) {
    if (typeof raw.telemetry.enabled === 'boolean') {
      telemetryEnabled = raw.telemetry.enabled;
    } else if (raw.telemetry.enabled !== undefined) {
      changed = true;
    }
    if (
      typeof raw.telemetry.deviceId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.telemetry.deviceId)
    ) {
      deviceId = raw.telemetry.deviceId;
    }
  } else if (raw.telemetry !== undefined) {
    changed = true;
  }

  if (!deviceId) {
    deviceId = randomUUID();
    changed = true;
  }

  return {
    config: {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      installDir,
      registryUrl,
      telemetry: {
        enabled: telemetryEnabled,
        deviceId,
      },
    },
    legacyInstalledSkills,
    changed,
  };
}

function normalizeIndex(raw: unknown): { index: VettIndex; changed: boolean } {
  let changed = false;

  if (!isRecord(raw)) {
    return { index: DEFAULT_INDEX, changed: true };
  }

  const schemaVersion =
    typeof raw.schemaVersion === 'number' ? raw.schemaVersion : INDEX_SCHEMA_VERSION - 1;
  if (schemaVersion !== INDEX_SCHEMA_VERSION) changed = true;

  const installedSkills = Array.isArray(raw.installedSkills)
    ? (raw.installedSkills as InstalledSkill[])
    : DEFAULT_INDEX.installedSkills;
  if (raw.installedSkills !== undefined && !Array.isArray(raw.installedSkills)) changed = true;

  return {
    index: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      installedSkills,
    },
    changed,
  };
}

function migrateLegacyInstalledSkills(): InstalledSkill[] | undefined {
  const rawConfig = readJsonFile(CONFIG_FILE);
  if (!isRecord(rawConfig) || !Array.isArray(rawConfig.installedSkills)) return undefined;

  const { config, legacyInstalledSkills, changed } = normalizeConfig(rawConfig);
  if (changed) {
    saveConfig(config);
  }

  return legacyInstalledSkills;
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

export function loadConfig(): VettConfig {
  ensureConfigDir();

  const raw = readJsonFile(CONFIG_FILE);
  const { config, legacyInstalledSkills, changed } = normalizeConfig(raw);

  if (legacyInstalledSkills && !existsSync(INDEX_FILE)) {
    saveIndex({
      schemaVersion: INDEX_SCHEMA_VERSION,
      installedSkills: legacyInstalledSkills,
    });
  }

  if (!existsSync(CONFIG_FILE) || changed) {
    saveConfig(config);
  }

  // Env var always takes precedence
  if (process.env.VETT_REGISTRY_URL) {
    config.registryUrl = process.env.VETT_REGISTRY_URL;
  }
  if (process.env.VETT_INSTALL_DIR) {
    config.installDir = process.env.VETT_INSTALL_DIR;
  }
  const envTelemetry = parseEnvBool(process.env.VETT_TELEMETRY_ENABLED);
  if (envTelemetry !== undefined) {
    config.telemetry.enabled = envTelemetry;
  }

  return config;
}

export function saveConfig(config: VettConfig): void {
  ensureConfigDir();
  withFileLock(CONFIG_LOCK, () => {
    writeJsonAtomic(CONFIG_FILE, config);
  });
}

export function loadIndex(): VettIndex {
  ensureConfigDir();

  const raw = readJsonFile(INDEX_FILE);

  if (!raw) {
    const legacyInstalledSkills = migrateLegacyInstalledSkills();
    if (legacyInstalledSkills) {
      const index = {
        schemaVersion: INDEX_SCHEMA_VERSION,
        installedSkills: legacyInstalledSkills,
      };
      saveIndex(index);
      return index;
    }
  }

  const { index, changed } = normalizeIndex(raw);
  if (!existsSync(INDEX_FILE) || changed) {
    saveIndex(index);
  }

  return index;
}

export function saveIndex(index: VettIndex): void {
  ensureConfigDir();
  withFileLock(INDEX_LOCK, () => {
    writeJsonAtomic(INDEX_FILE, index);
  });
}

export function getSkillPath(owner: string, repo: string, name: string): string {
  return join(SKILLS_DIR, owner, repo, name);
}

export function getSkillDir(owner: string, repo: string | null, name: string): string {
  return repo ? join(SKILLS_DIR, owner, repo, name) : join(SKILLS_DIR, owner, name);
}

export function addInstalledSkill(skill: InstalledSkill): void {
  const index = loadIndex();
  const existingIndex = index.installedSkills.findIndex(
    (s) => s.owner === skill.owner && s.repo === skill.repo && s.name === skill.name
  );

  if (existingIndex >= 0) {
    index.installedSkills[existingIndex] = skill;
  } else {
    index.installedSkills.push(skill);
  }

  saveIndex(index);
}

export function removeInstalledSkill(owner: string, repo: string | null, name: string): void {
  const index = loadIndex();
  index.installedSkills = index.installedSkills.filter(
    (s) => !(s.owner === owner && s.repo === repo && s.name === name)
  );
  saveIndex(index);
}

export function getInstalledSkill(
  owner: string,
  repo: string | null,
  name: string
): InstalledSkill | undefined {
  const index = loadIndex();
  return index.installedSkills.find((s) => s.owner === owner && s.repo === repo && s.name === name);
}

export function isTelemetryEnabled(): boolean {
  return loadConfig().telemetry.enabled;
}

export function getDeviceId(): string {
  return loadConfig().telemetry.deviceId!;
}
