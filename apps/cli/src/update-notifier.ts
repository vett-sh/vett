import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import semver from 'semver';

declare const __VERSION__: string;

const CACHE_SCHEMA_VERSION = 1 as const;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_PACKAGE_NAME = 'vett';

interface UpdateCacheV1 {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  checkedAtMs: number;
  latest: string;
}

interface CheckOptions {
  packageName?: string;
  currentVersion?: string;
  cachePath?: string;
  nowMs?: number;
  intervalMs?: number;
  timeoutMs?: number;
  fetchLatest?: (packageName: string, signal: AbortSignal) => Promise<string | null>;
}

interface CheckResult {
  latest: string | null;
  updateAvailable: boolean;
  checkedAtMs: number | null;
  source: 'cache' | 'network' | 'skipped' | 'error';
}

export interface CachedUpdateInfo {
  latest: string;
  checkedAtMs: number;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

function defaultCachePath(): string {
  return join(homedir(), '.vett', 'update.json');
}

function readCache(path: string): UpdateCacheV1 | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    if (rec.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    if (typeof rec.checkedAtMs !== 'number') return null;
    if (typeof rec.latest !== 'string') return null;
    return {
      schemaVersion: CACHE_SCHEMA_VERSION,
      checkedAtMs: rec.checkedAtMs,
      latest: rec.latest,
    };
  } catch {
    return null;
  }
}

export function getCachedUpdateInfo(cachePath?: string): CachedUpdateInfo | null {
  const cached = readCache(cachePath ?? defaultCachePath());
  if (!cached) return null;
  const latest = semver.valid(cached.latest);
  if (!latest) return null;
  return { latest, checkedAtMs: cached.checkedAtMs };
}

function writeCacheAtomic(path: string, cache: UpdateCacheV1): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, path);
}

async function fetchLatestFromNpm(packageName: string, signal: AbortSignal): Promise<string | null> {
  const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
    headers: { 'User-Agent': `vett-cli/${__VERSION__}` },
    signal,
  });
  if (!resp.ok) return null;
  const data = (await resp.json().catch(() => null)) as null | { version?: unknown };
  if (!data || typeof data.version !== 'string') return null;
  return data.version;
}

export async function checkForUpdates(options: CheckOptions = {}): Promise<CheckResult> {
  const packageName = options.packageName ?? DEFAULT_PACKAGE_NAME;
  const currentVersion = options.currentVersion ?? __VERSION__;
  const cachePath = options.cachePath ?? defaultCachePath();
  const nowMs = options.nowMs ?? Date.now();
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchLatest = options.fetchLatest ?? fetchLatestFromNpm;

  const current = semver.valid(currentVersion);
  if (!current) {
    return { latest: null, updateAvailable: false, checkedAtMs: null, source: 'error' };
  }

  const cached = readCache(cachePath);
  if (cached && nowMs - cached.checkedAtMs < intervalMs) {
    const latest = semver.valid(cached.latest);
    const updateAvailable = !!latest && semver.gt(latest, current);
    return {
      latest: latest ?? null,
      updateAvailable,
      checkedAtMs: cached.checkedAtMs,
      source: 'cache',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const latestRaw = await fetchLatest(packageName, controller.signal);
    clearTimeout(timeout);

    const latest = latestRaw ? semver.valid(latestRaw) : null;
    if (latest) {
      writeCacheAtomic(cachePath, {
        schemaVersion: CACHE_SCHEMA_VERSION,
        checkedAtMs: nowMs,
        latest,
      });
    }
    const updateAvailable = !!latest && semver.gt(latest, current);
    return { latest, updateAvailable, checkedAtMs: nowMs, source: 'network' };
  } catch {
    return { latest: null, updateAvailable: false, checkedAtMs: null, source: 'error' };
  }
}

function shouldNotifyUpdate(opts: { command?: string }): boolean {
  if (opts.command === 'upgrade') return false;
  if (isTruthyEnv(process.env.VETT_NO_UPDATE_NOTIFIER)) return false;
  if (isTruthyEnv(process.env.CI)) return false;
  if (process.env.NODE_ENV === 'test') return false;
  return !!process.stdout.isTTY;
}

function printUpdateMessage(currentVersion: string, latest: string): void {
  p.log.info(
    `${pc.yellow('Update available:')} ${pc.dim(currentVersion)} ${pc.dim('->')} ${pc.cyan(latest)}`
  );
  p.log.info(
    `Run: ${pc.cyan('pnpm add -g vett@latest')} ${pc.dim('or')} ${pc.cyan('npm i -g vett@latest')}`
  );
  p.log.info(`npx: ${pc.cyan('npx -y vett@latest <command>')}`);
  p.log.info(pc.dim(`Disable: VETT_NO_UPDATE_NOTIFIER=1`));
}

export function runUpdateNotifier(opts: { command?: string } = {}): void {
  if (!shouldNotifyUpdate(opts)) return;
  // Fire-and-forget; never block or crash command execution.
  void (async () => {
    const res = await checkForUpdates();
    if (!res.updateAvailable || !res.latest) return;
    printUpdateMessage(__VERSION__, res.latest);
  })().catch(() => {});
}
