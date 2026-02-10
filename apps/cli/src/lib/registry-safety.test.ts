import { describe, it, expect } from 'vitest';
import { validateSkillDetail, validateSkillsListResponse, assertHttpsUrl } from './registry-safety';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const VALID_SHA = 'a'.repeat(64);
const VALID_COMMIT_SHA = 'b'.repeat(40);

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    skillId: VALID_UUID,
    version: '1.0.0',
    hash: VALID_SHA,
    artifactUrl: 'https://cdn.example.com/artifact.json',
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
    expect(result.versions).toHaveLength(0);
  });

  it('accepts a valid skill with versions', () => {
    const result = validateSkillDetail(makeSkillDetail({ versions: [makeVersion()] }));
    expect(result.versions).toHaveLength(1);
  });

  it('accepts null repo', () => {
    const result = validateSkillDetail(makeSkillDetail({ repo: null }));
    expect(result.repo).toBeNull();
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

  // HTTPS enforcement on artifactUrl in versions
  it('rejects http artifactUrl in versions', () => {
    expect(() =>
      validateSkillDetail(
        makeSkillDetail({
          versions: [makeVersion({ artifactUrl: 'http://cdn.example.com/artifact.json' })],
        })
      )
    ).toThrow(/invalid response/i);
  });

  it('rejects file:// artifactUrl in versions', () => {
    expect(() =>
      validateSkillDetail(
        makeSkillDetail({
          versions: [makeVersion({ artifactUrl: 'file:///etc/passwd' })],
        })
      )
    ).toThrow(/invalid response/i);
  });

  it('rejects ftp artifactUrl in versions', () => {
    expect(() =>
      validateSkillDetail(
        makeSkillDetail({
          versions: [makeVersion({ artifactUrl: 'ftp://cdn.example.com/artifact.json' })],
        })
      )
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

  it('rejects poisoned entry with http artifactUrl in latestVersion', () => {
    expect(() =>
      validateSkillsListResponse({
        skills: [
          makeSkillWithLatest({
            latestVersion: makeVersion({
              artifactUrl: 'http://cdn.example.com/artifact.json',
            }),
          }),
        ],
      })
    ).toThrow(/invalid response/i);
  });

  it('preserves unknown fields on skills in list (forward compat)', () => {
    const result = validateSkillsListResponse({
      skills: [makeSkillWithLatest({ newApiField: 42 })],
      pagination: { total: 100 },
    });
    expect(result).toHaveLength(1);
    expect((result[0] as unknown as Record<string, unknown>).newApiField).toBe(42);
  });

  it('preserves unknown fields on nested version (forward compat)', () => {
    const result = validateSkillsListResponse({
      skills: [makeSkillWithLatest({ latestVersion: makeVersion({ newVersionField: true }) })],
    });
    const version = result[0].latestVersion as unknown as Record<string, unknown>;
    expect(version.newVersionField).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assertHttpsUrl
// ---------------------------------------------------------------------------

describe('assertHttpsUrl', () => {
  it('allows https URLs', () => {
    expect(() => assertHttpsUrl('https://cdn.example.com/file', 'artifact')).not.toThrow();
  });

  it('rejects http URLs', () => {
    expect(() => assertHttpsUrl('http://cdn.example.com/file', 'artifact')).toThrow(/https:/);
  });

  it('rejects file:// URLs', () => {
    expect(() => assertHttpsUrl('file:///etc/passwd', 'artifact')).toThrow(/https:/);
  });

  it('rejects ftp URLs', () => {
    expect(() => assertHttpsUrl('ftp://cdn.example.com/file', 'artifact')).toThrow(/https:/);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertHttpsUrl('not-a-url', 'artifact')).toThrow(/malformed/i);
  });

  it('does not echo the URL in malformed error', () => {
    const secret = 'https-ish://cdn.example.com/file?token=SECRET_KEY_123';
    let caught: Error | undefined;
    try {
      assertHttpsUrl(secret, 'artifact');
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).not.toContain('SECRET_KEY_123');
  });

  it('includes context in error message', () => {
    try {
      assertHttpsUrl('http://cdn.example.com/file', 'download');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/download/);
    }
  });
});
