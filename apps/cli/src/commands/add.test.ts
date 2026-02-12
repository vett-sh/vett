import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_SHA = 'a'.repeat(64);
const VALID_COMMIT_SHA = 'b'.repeat(40);

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    hash: VALID_SHA,
    size: 1024,
    risk: 'low' as const,
    summary: 'test',
    analysis: null,
    gitRef: 'main',
    commitSha: VALID_COMMIT_SHA,
    sourceUrl: null,
    sourceFingerprint: null,
    sigstoreBundle: null,
    analyzedAt: null,
    scanStatus: 'completed' as const,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
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
    versions: [makeVersion()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// selectVersion (pure function)
// ---------------------------------------------------------------------------

describe('selectVersion', () => {
  // Dynamic import to avoid hoisting issues with mocks
  async function getSelectVersion() {
    const mod = await import('./add');
    return mod.selectVersion;
  }

  it('returns the first version when no version is specified', async () => {
    const selectVersion = await getSelectVersion();
    const v1 = makeVersion({ version: '1.0.0' });
    const v2 = makeVersion({ version: '0.9.0' });
    const skill = makeSkillDetail({ versions: [v1, v2] });

    const result = selectVersion(skill);
    expect(result.version).toBe('1.0.0');
  });

  it('returns the matching version when specified', async () => {
    const selectVersion = await getSelectVersion();
    const v1 = makeVersion({ version: '1.0.0' });
    const v2 = makeVersion({ version: '0.9.0' });
    const skill = makeSkillDetail({ versions: [v1, v2] });

    const result = selectVersion(skill, '0.9.0');
    expect(result.version).toBe('0.9.0');
  });

  it('throws when specified version is not found', async () => {
    const selectVersion = await getSelectVersion();
    const skill = makeSkillDetail({ versions: [makeVersion({ version: '1.0.0' })] });

    expect(() => selectVersion(skill, '2.0.0')).toThrow(/Version 2.0.0 not found/);
  });

  it('throws when skill has no versions', async () => {
    const selectVersion = await getSelectVersion();
    const skill = makeSkillDetail({ versions: [] });

    expect(() => selectVersion(skill)).toThrow(/No versions available/);
  });
});

// ---------------------------------------------------------------------------
// add() resolve flow (mocked)
// ---------------------------------------------------------------------------

// Mock all heavy dependencies — we're testing the flow logic, not the I/O
const mockResolveSkill = vi.fn();
const mockWaitForJob = vi.fn();
const mockDownloadArtifact = vi.fn();
const mockGetSkillDetail = vi.fn();
const mockGetInstalledSkillBySlug = vi.fn().mockReturnValue(null);
const mockAddInstalledSkill = vi.fn();
const mockGetSkillDir = vi.fn().mockReturnValue('/tmp/test-skill-dir');
const mockDetectInstalledAgents = vi.fn().mockResolvedValue([]);
const mockInstallToAgents = vi.fn().mockResolvedValue([]);
const mockVerifyManifestOrThrow = vi.fn().mockResolvedValue(undefined);

const mockSpinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };
const mockConfirm = vi.fn();
const mockNote = vi.fn();
const mockLogError = vi.fn();
const mockLogWarn = vi.fn();
const mockLogInfo = vi.fn();
const mockLogSuccess = vi.fn();
const mockLogStep = vi.fn();
const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockCancel = vi.fn();
const mockIsCancel = vi.fn().mockReturnValue(false);

vi.mock('../api', () => ({
  resolveSkill: (...args: unknown[]) => mockResolveSkill(...args),
  waitForJob: (...args: unknown[]) => mockWaitForJob(...args),
  downloadArtifact: (...args: unknown[]) => mockDownloadArtifact(...args),
  getSkillDetail: (...args: unknown[]) => mockGetSkillDetail(...args),
  RateLimitError: class RateLimitError extends Error {
    retryAfter: number;
    constructor(retryAfter: number) {
      super('Rate limit');
      this.retryAfter = retryAfter;
    }
  },
}));

vi.mock('../config', () => ({
  getSkillDir: (...args: unknown[]) => mockGetSkillDir(...args),
  addInstalledSkill: (...args: unknown[]) => mockAddInstalledSkill(...args),
  getInstalledSkillBySlug: (...args: unknown[]) => mockGetInstalledSkillBySlug(...args),
}));

vi.mock('../signatures', () => ({
  verifyManifestOrThrow: (...args: unknown[]) => mockVerifyManifestOrThrow(...args),
}));

vi.mock('../agents', () => ({
  detectInstalledAgents: (...args: unknown[]) => mockDetectInstalledAgents(...args),
  parseAgentTypes: vi.fn().mockReturnValue({ valid: [], invalid: [] }),
  agents: {},
}));

vi.mock('../installer', () => ({
  installToAgents: (...args: unknown[]) => mockInstallToAgents(...args),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../lib/fs-safety', () => ({
  assertNoSymlinkPathComponents: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  spinner: () => mockSpinner,
  confirm: (...args: unknown[]) => mockConfirm(...args),
  note: (...args: unknown[]) => mockNote(...args),
  cancel: (...args: unknown[]) => mockCancel(...args),
  isCancel: (...args: unknown[]) => mockIsCancel(...args),
  log: {
    error: (...args: unknown[]) => mockLogError(...args),
    warn: (...args: unknown[]) => mockLogWarn(...args),
    info: (...args: unknown[]) => mockLogInfo(...args),
    success: (...args: unknown[]) => mockLogSuccess(...args),
    step: (...args: unknown[]) => mockLogStep(...args),
  },
}));

// Minimal valid manifest that passes schema validation
const VALID_MANIFEST = JSON.stringify({
  schemaVersion: 1,
  files: [{ path: 'hello.md', content: '# Hello' }],
});

/** Create a clean ArrayBuffer from a string (avoids Node Buffer pool sharing). */
function toArrayBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

describe('add command', () => {
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent actual process.exit — throw to break flow
    process.exit = vi.fn((code) => {
      throw new Error(`process.exit(${code})`);
    }) as never;
    mockConfirm.mockResolvedValue(true);
    mockDownloadArtifact.mockResolvedValue(toArrayBuffer(VALID_MANIFEST));
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  async function importAdd() {
    const mod = await import('./add');
    return mod.add;
  }

  it('installs skill on ready response', async () => {
    const add = await importAdd();
    const detail = makeSkillDetail();
    mockResolveSkill.mockResolvedValue({ status: 'ready', skill: detail });

    await add('acme/tools/hello', { yes: true });

    expect(mockResolveSkill).toHaveBeenCalledWith('acme/tools/hello');
    expect(mockDownloadArtifact).toHaveBeenCalledWith(VALID_UUID, '1.0.0', VALID_SHA);
    expect(mockAddInstalledSkill).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'acme/tools/hello', version: '1.0.0' })
    );
  });

  it('polls and fetches detail on processing response', async () => {
    const add = await importAdd();
    const detail = makeSkillDetail();
    mockResolveSkill.mockResolvedValue({
      status: 'processing',
      jobId: 'job-1',
      // slug not on processing response — comes from completed job
    });
    mockWaitForJob.mockResolvedValue({
      status: 'completed',
      slug: 'acme/tools/hello',
      createdAt: '2024-01-01',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:00:01Z',
    });
    mockGetSkillDetail.mockResolvedValue(detail);

    await add('https://github.com/acme/tools/tree/main/hello', { yes: true });

    expect(mockWaitForJob).toHaveBeenCalledWith('job-1', expect.anything());
    expect(mockGetSkillDetail).toHaveBeenCalledWith('acme/tools/hello');
    expect(mockAddInstalledSkill).toHaveBeenCalled();
  });

  it('exits on not_found response', async () => {
    const add = await importAdd();
    mockResolveSkill.mockResolvedValue({
      status: 'not_found',
      message: 'Skill not found',
    });

    await expect(add('nonexistent/skill', {})).rejects.toThrow(/process\.exit/);
    expect(mockLogError).toHaveBeenCalledWith('Skill not found');
    expect(mockDownloadArtifact).not.toHaveBeenCalled();
  });

  it('exits when processing response has no slug', async () => {
    const add = await importAdd();
    mockResolveSkill.mockResolvedValue({
      status: 'processing',
      jobId: 'job-1',
      // no slug
    });
    mockWaitForJob.mockResolvedValue({ status: 'completed', createdAt: '2024-01-01' });

    await expect(add('some-url', { yes: true })).rejects.toThrow(/process\.exit/);
    expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('slug'));
  });

  it('exits when detail has no id for download', async () => {
    const add = await importAdd();
    const detail = makeSkillDetail({ id: undefined });
    mockResolveSkill.mockResolvedValue({ status: 'ready', skill: detail });

    await expect(add('acme/tools/hello', { yes: true })).rejects.toThrow(/process\.exit/);
    expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('skill ID'));
    expect(mockDownloadArtifact).not.toHaveBeenCalled();
  });

  it('refuses installation of critical-risk skills', async () => {
    const add = await importAdd();
    const detail = makeSkillDetail({
      versions: [makeVersion({ risk: 'critical' })],
    });
    mockResolveSkill.mockResolvedValue({ status: 'ready', skill: detail });

    await expect(add('acme/tools/evil', { yes: true })).rejects.toThrow(/process\.exit/);
    expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('malicious'));
    expect(mockDownloadArtifact).not.toHaveBeenCalled();
  });

  it('exits when job fails', async () => {
    const add = await importAdd();
    mockResolveSkill.mockResolvedValue({
      status: 'processing',
      jobId: 'job-fail',
      slug: 'acme/tools/hello',
    });
    mockWaitForJob.mockResolvedValue({
      status: 'failed',
      error: 'Analysis error',
      createdAt: '2024-01-01',
    });

    await expect(add('acme/tools/hello', { yes: true })).rejects.toThrow(/process\.exit/);
    expect(mockGetSkillDetail).not.toHaveBeenCalled();
  });

  it('downloads through registry endpoint with skill ID', async () => {
    const add = await importAdd();
    const skillId = '22222222-2222-2222-2222-222222222222';
    const detail = makeSkillDetail({
      id: skillId,
      versions: [makeVersion({ version: '2.0.0', hash: 'b'.repeat(64) })],
    });
    mockResolveSkill.mockResolvedValue({ status: 'ready', skill: detail });

    await add('acme/tools/hello', { yes: true });

    expect(mockDownloadArtifact).toHaveBeenCalledWith(skillId, '2.0.0', 'b'.repeat(64));
  });
});
