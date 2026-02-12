import { describe, it, expect } from 'vitest';
import {
  validateSkillDetail,
  validateSkillsListResponse,
  validateResolveResponse,
} from './registry-safety';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_SHA = 'a'.repeat(64);
const VALID_COMMIT_SHA = 'b'.repeat(40);

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    skillId: VALID_UUID,
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

function makeSkillDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    slug: 'acme/tools/hello',
    owner: 'acme',
    repo: 'tools',
    name: 'hello',
    description: 'A test skill',
    sourceUrl: 'https://github.com/acme/tools',
    installCount: 42,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    versions: [],
    ...overrides,
  };
}

function makeSkillWithLatest(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    slug: 'acme/tools/hello',
    owner: 'acme',
    repo: 'tools',
    name: 'hello',
    description: 'A test skill',
    sourceUrl: 'https://github.com/acme/tools',
    installCount: 42,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    latestVersion: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateSkillDetail
// ---------------------------------------------------------------------------

describe('validateSkillDetail', () => {
  it('accepts a valid skill with no versions', () => {
    const result = validateSkillDetail(makeSkillDetail());
    expect(result.owner).toBe('acme');
    expect(result.slug).toBe('acme/tools/hello');
    expect(result.versions).toHaveLength(0);
  });

  it('accepts a valid skill with versions', () => {
    const result = validateSkillDetail(makeSkillDetail({ versions: [makeVersion()] }));
    expect(result.versions).toHaveLength(1);
  });

  it('accepts null repo', () => {
    const result = validateSkillDetail(makeSkillDetail({ repo: null, slug: 'example.com/hello' }));
    expect(result.repo).toBeNull();
    expect(result.slug).toBe('example.com/hello');
  });

  // Path traversal
  it('rejects ../evil as owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: '../evil' }))).toThrow(
      /invalid response/i
    );
  });

  it('rejects ../../etc as repo', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ repo: '../../etc' }))).toThrow(
      /invalid response/i
    );
  });

  it('rejects ../passwd as name', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ name: '../passwd' }))).toThrow(
      /invalid response/i
    );
  });

  // Slash injection
  it('rejects forward slash in owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: 'foo/bar' }))).toThrow(
      /invalid response/i
    );
  });

  it('rejects backslash in owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: 'foo\\bar' }))).toThrow(
      /invalid response/i
    );
  });

  // Null byte
  it('rejects null byte in owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: 'foo\0bar' }))).toThrow(
      /invalid response/i
    );
  });

  // Whitespace
  it('rejects leading space in owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: ' acme' }))).toThrow(
      /invalid response/i
    );
  });

  it('rejects trailing space in name', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ name: 'hello ' }))).toThrow(
      /invalid response/i
    );
  });

  // Non-ASCII
  it('rejects unicode in name', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ name: 'h\u00e9llo' }))).toThrow(
      /invalid response/i
    );
  });

  // Windows-reserved characters
  it.each(['<', '>', ':', '"', '|', '?', '*'])(
    'rejects Windows-reserved char "%s" in owner',
    (c) => {
      expect(() => validateSkillDetail(makeSkillDetail({ owner: `foo${c}bar` }))).toThrow(
        /invalid response/i
      );
    }
  );

  // Shell metacharacters
  it.each(['$', '`', '&', ';', '(', ')'])('rejects shell metachar "%s" in name', (c) => {
    expect(() => validateSkillDetail(makeSkillDetail({ name: `foo${c}bar` }))).toThrow(
      /invalid response/i
    );
  });

  // Dot-only
  it('rejects "." as owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: '.' }))).toThrow(/invalid response/i);
  });

  it('rejects ".." as owner', () => {
    expect(() => validateSkillDetail(makeSkillDetail({ owner: '..' }))).toThrow(
      /invalid response/i
    );
  });

  // Type confusion
  it('rejects string input', () => {
    expect(() => validateSkillDetail('not an object')).toThrow(/invalid response/i);
  });

  it('rejects number input', () => {
    expect(() => validateSkillDetail(42)).toThrow(/invalid response/i);
  });

  it('rejects null input', () => {
    expect(() => validateSkillDetail(null)).toThrow(/invalid response/i);
  });

  it('rejects undefined input', () => {
    expect(() => validateSkillDetail(undefined)).toThrow(/invalid response/i);
  });

  it('rejects missing required fields', () => {
    expect(() => validateSkillDetail({ owner: 'acme' })).toThrow(/invalid response/i);
  });

  it('rejects missing slug', () => {
    expect(() =>
      validateSkillDetail({
        owner: 'acme',
        repo: 'tools',
        name: 'hello',
        versions: [],
      })
    ).toThrow(/invalid response/i);
  });

  // Error quality
  it('includes field path in error message', () => {
    try {
      validateSkillDetail(makeSkillDetail({ owner: '../evil' }));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/owner/);
    }
  });

  it('does not leak the bad value in error message', () => {
    const poison = '../secret-token-123';
    let caught: Error | undefined;
    try {
      validateSkillDetail(makeSkillDetail({ owner: poison }));
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/invalid response/i);
    expect(caught!.message).not.toContain(poison);
  });

  it('preserves unknown fields from API response (forward compat)', () => {
    const result = validateSkillDetail(makeSkillDetail({ futureField: 'hello-from-the-future' }));
    expect((result as unknown as Record<string, unknown>).futureField).toBe(
      'hello-from-the-future'
    );
  });

  it('tolerates missing optional fields on skill', () => {
    const minimal = {
      slug: 'acme/tools/hello',
      owner: 'acme',
      repo: 'tools',
      name: 'hello',
      versions: [],
    };
    const result = validateSkillDetail(minimal);
    expect(result.owner).toBe('acme');
    expect(result.installCount).toBe(0);
    expect(result.description).toBeNull();
  });

  it('tolerates missing optional fields on version', () => {
    const minimalVersion = {
      version: '1.0.0',
      hash: VALID_SHA,
      risk: 'low',
      analysis: null,
      sigstoreBundle: null,
    };
    const result = validateSkillDetail({
      slug: 'acme/tools/hello',
      owner: 'acme',
      repo: 'tools',
      name: 'hello',
      versions: [minimalVersion],
    });
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].size).toBe(0);
    expect(result.versions[0].scanStatus).toBe('pending');
    expect(result.versions[0].summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateSkillsListResponse
// ---------------------------------------------------------------------------

describe('validateSkillsListResponse', () => {
  it('accepts a valid list', () => {
    const result = validateSkillsListResponse({
      skills: [makeSkillWithLatest()],
    });
    expect(result).toHaveLength(1);
    expect(result[0].owner).toBe('acme');
    expect(result[0].slug).toBe('acme/tools/hello');
  });

  it('accepts a list with lightweight latestVersion summary', () => {
    const result = validateSkillsListResponse({
      skills: [
        makeSkillWithLatest({
          latestVersion: { version: '1.0.0', risk: 'low', scanStatus: 'completed' },
        }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].latestVersion?.version).toBe('1.0.0');
    expect(result[0].latestVersion?.risk).toBe('low');
  });

  it('accepts an empty list', () => {
    const result = validateSkillsListResponse({ skills: [] });
    expect(result).toHaveLength(0);
  });

  it('rejects missing skills key', () => {
    expect(() => validateSkillsListResponse({})).toThrow(/invalid response/i);
  });

  it('rejects non-array skills', () => {
    expect(() => validateSkillsListResponse({ skills: 'not-array' })).toThrow(/invalid response/i);
  });

  it('rejects poisoned entry with traversal owner', () => {
    expect(() =>
      validateSkillsListResponse({
        skills: [makeSkillWithLatest({ owner: '../evil' })],
      })
    ).toThrow(/invalid response/i);
  });

  it('rejects entry missing slug', () => {
    const noSlug = { ...makeSkillWithLatest() };
    delete (noSlug as Record<string, unknown>).slug;
    expect(() => validateSkillsListResponse({ skills: [noSlug] })).toThrow(/invalid response/i);
  });

  it('preserves unknown fields on skills in list (forward compat)', () => {
    const result = validateSkillsListResponse({
      skills: [makeSkillWithLatest({ newApiField: 42 })],
      pagination: { total: 100, limit: 20, offset: 0 },
    });
    expect(result).toHaveLength(1);
    expect((result[0] as unknown as Record<string, unknown>).newApiField).toBe(42);
  });

  it('preserves unknown fields on nested version summary (forward compat)', () => {
    const result = validateSkillsListResponse({
      skills: [
        makeSkillWithLatest({
          latestVersion: {
            version: '1.0.0',
            risk: 'low',
            scanStatus: 'completed',
            newVersionField: true,
          },
        }),
      ],
    });
    const version = result[0].latestVersion as unknown as Record<string, unknown>;
    expect(version.newVersionField).toBe(true);
  });

  it('tolerates missing optional fields on skill in list', () => {
    const result = validateSkillsListResponse({
      skills: [
        {
          slug: 'acme/tools/hello',
          owner: 'acme',
          repo: 'tools',
          name: 'hello',
          latestVersion: null,
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].installCount).toBe(0);
    expect(result[0].description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateResolveResponse
// ---------------------------------------------------------------------------

describe('validateResolveResponse', () => {
  it('accepts a ready response', () => {
    const result = validateResolveResponse({
      status: 'ready',
      skill: makeSkillDetail({ versions: [makeVersion()] }),
    });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.skill.slug).toBe('acme/tools/hello');
      expect(result.skill.versions).toHaveLength(1);
    }
  });

  it('accepts a processing response', () => {
    const result = validateResolveResponse({
      status: 'processing',
      jobId: 'job-123',
      slug: 'acme/tools/hello',
    });
    expect(result.status).toBe('processing');
    if (result.status === 'processing') {
      expect(result.jobId).toBe('job-123');
      expect(result.slug).toBe('acme/tools/hello');
    }
  });

  it('accepts a processing response without slug', () => {
    const result = validateResolveResponse({
      status: 'processing',
      jobId: 'job-123',
    });
    expect(result.status).toBe('processing');
  });

  it('accepts a not_found response', () => {
    const result = validateResolveResponse({
      status: 'not_found',
      message: 'Version 1.2.0 not found for acme/tools/hello',
    });
    expect(result.status).toBe('not_found');
    if (result.status === 'not_found') {
      expect(result.message).toContain('1.2.0');
    }
  });

  it('accepts a not_found response with default message', () => {
    const result = validateResolveResponse({
      status: 'not_found',
    });
    expect(result.status).toBe('not_found');
    if (result.status === 'not_found') {
      expect(result.message).toBe('Skill not found');
    }
  });

  it('rejects invalid status', () => {
    expect(() => validateResolveResponse({ status: 'invalid' })).toThrow(/invalid response/i);
  });

  it('rejects missing status', () => {
    expect(() => validateResolveResponse({})).toThrow(/invalid response/i);
  });

  it('rejects ready response with invalid skill detail', () => {
    expect(() =>
      validateResolveResponse({
        status: 'ready',
        skill: { owner: '../evil' },
      })
    ).toThrow(/invalid response/i);
  });

  it('rejects processing response without jobId', () => {
    expect(() =>
      validateResolveResponse({
        status: 'processing',
      })
    ).toThrow(/invalid response/i);
  });
});
