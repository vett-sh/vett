/**
 * URL parser for skill sources
 *
 * Normalizes any skill source URL to a canonical Vett ID.
 * Supports GitHub and arbitrary HTTP sources.
 */

export interface ParsedSkillUrl {
  /** Host domain (github.com, examplehost.com) */
  host: string;
  /** Full normalized ID (github.com/owner/repo/skill) */
  id: string;
  /** Repository owner (for git hosts) */
  owner?: string;
  /** Repository name (for git hosts) */
  repo?: string;
  /** Normalized skill name (for display/ID) */
  skill?: string;
  /** Full path within repo (for fetching) */
  path?: string;
  /** Branch or tag ref */
  ref?: string;
  /** Original URL for provenance */
  sourceUrl: string;
}

export type SkillHost = 'github.com' | 'other';

/**
 * Parse and normalize a skill source URL
 *
 * @example
 * parseSkillUrl('https://github.com/vercel-labs/agent-skills/tree/main/skills/react')
 * // => { host: 'github.com', id: 'github.com/vercel-labs/agent-skills/react', ... }
 *
 * @example
 * parseSkillUrl('git@github.com:anthropics/skills.git')
 * // => { host: 'github.com', id: 'github.com/anthropics/skills', ... }
 */
export function parseSkillUrl(url: string): ParsedSkillUrl {
  const sourceUrl = url;
  let normalized = url.trim();

  // Handle git@ SSH URLs (git@github.com:owner/repo.git)
  if (normalized.startsWith('git@')) {
    normalized = convertSshToHttps(normalized);
  }

  // Add protocol if missing
  if (!normalized.match(/^https?:\/\//)) {
    normalized = inferProtocol(normalized);
  }

  // Parse as URL
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid skill URL: ${url}`);
  }

  const host = normalizeHost(parsed.host);
  const pathParts = parsed.pathname.split('/').filter(Boolean);

  // Route to host-specific parser
  if (host === 'github.com') {
    return parseGitHostUrl(host, pathParts, sourceUrl);
  }

  return parseHttpUrl(host, pathParts, sourceUrl);
}

/**
 * Convert SSH git URL to HTTPS
 * git@github.com:owner/repo.git -> https://github.com/owner/repo
 */
function convertSshToHttps(sshUrl: string): string {
  const match = sshUrl.match(/^git@([^:]+):(.+)$/);
  if (!match) {
    throw new Error(`Invalid SSH URL format: ${sshUrl}`);
  }
  const [, host, path] = match;
  return `https://${host}/${path}`;
}

/**
 * Infer protocol for URLs without one
 */
function inferProtocol(url: string): string {
  // Known git hosts
  if (url.startsWith('github.com/')) {
    return `https://${url}`;
  }

  // Shorthand: owner/repo/skill -> try GitHub
  if (url.match(/^[\w-]+\/[\w-]+/)) {
    return `https://github.com/${url}`;
  }

  // Default to https
  return `https://${url}`;
}

/**
 * Normalize host (strip www, lowercase)
 */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * Parse GitHub URLs
 *
 * Formats:
 * - github.com/owner/repo
 * - github.com/owner/repo/tree/main/path/to/skill
 * - github.com/owner/repo/blob/main/SKILL.md
 */
function parseGitHostUrl(
  host: 'github.com',
  pathParts: string[],
  sourceUrl: string
): ParsedSkillUrl {
  if (pathParts.length < 2) {
    throw new Error(`Invalid ${host} URL: need at least owner/repo`);
  }

  const owner = pathParts[0].toLowerCase();
  const repo = stripGitSuffix(pathParts[1]).toLowerCase();

  let ref: string | undefined;
  let skillPath: string[] = [];

  // Check for /tree/<ref>/ or /blob/<ref>/ patterns
  if (pathParts.length > 2) {
    const refType = pathParts[2]; // 'tree' or 'blob'
    if (refType === 'tree' || refType === 'blob') {
      ref = pathParts[3];
      skillPath = pathParts.slice(4);
    } else {
      // Direct path without tree/blob (less common)
      skillPath = pathParts.slice(2);
    }
  }

  // Keep original path for fetching (lowercase, .md stripped)
  const path =
    skillPath.length > 0 ? skillPath.map((p) => p.replace(/\.md$/i, '')).join('/') : undefined;

  // Normalize skill path for ID (strips 'skills/' prefix)
  const skill = normalizeSkillPath(skillPath);

  // Build canonical ID
  const idParts = [host, owner, repo];
  if (skill) {
    idParts.push(skill);
  }
  const id = idParts.join('/');

  return {
    host,
    id,
    owner,
    repo,
    skill: skill || undefined,
    path,
    ref,
    sourceUrl,
  };
}

/**
 * Parse arbitrary HTTP URLs
 *
 * Extracts repo (parent directory) and skill (filename) separately to avoid
 * duplication in the database identity tuple.
 *
 * Formats:
 * - example.com/SKILL.md -> repo=example, skill=example
 * - example.com/docs/skill.md -> repo=example, skill=docs
 * - example.com/path/to/docs/skill.md -> repo=path/to, skill=docs
 * - example.com/docs/frontend.md -> repo=docs, skill=frontend
 */
function parseHttpUrl(host: string, pathParts: string[], sourceUrl: string): ParsedSkillUrl {
  const normalized = pathParts.map((p) => p.toLowerCase());

  // Strip .md extension from last part
  if (normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    normalized[normalized.length - 1] = last.replace(/\.md$/, '');
  }

  const hostBase = host.split('.')[0]; // expample.com -> moltbook

  let repo: string;
  let skill: string;

  if (normalized.length === 0) {
    // Bare domain (example.com/)
    repo = hostBase;
    skill = hostBase;
  } else if (normalized.length === 1) {
    // Single component (example.com/foo.md or example.com/skill.md)
    repo = hostBase;
    // If filename is literally "skill", use host base as skill name
    skill = normalized[0] === 'skill' ? hostBase : normalized[0];
  } else {
    // Multiple components (example.com/path/to/foo.md)
    const filename = normalized[normalized.length - 1];
    const parentPath = normalized.slice(0, -1);

    if (filename === 'skill') {
      // skill.md convention: the directory containing skill.md IS the skill
      // e.g., docs/skill.md -> the skill is "docs"
      if (parentPath.length === 1) {
        // e.g., docs/skill.md -> repo=hostBase, skill=docs
        repo = hostBase;
        skill = parentPath[0];
      } else {
        // e.g., path/to/docs/skill.md -> repo=path/to, skill=docs
        repo = parentPath.slice(0, -1).join('/');
        skill = parentPath[parentPath.length - 1];
      }
    } else {
      // Regular file: skill name is the filename
      // e.g., docs/frontend.md -> repo=docs, skill=frontend
      repo = parentPath.join('/');
      skill = filename;
    }
  }

  const id = `${host}/${repo}/${skill}`;

  return {
    host,
    id,
    repo,
    skill,
    sourceUrl,
  };
}

/**
 * Strip .git suffix from repo name
 */
function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/, '');
}

/**
 * Normalize skill path within a repo
 * - Lowercase
 * - Strip .md extension
 * - Handle common patterns like /skills/name
 */
function normalizeSkillPath(parts: string[]): string {
  if (parts.length === 0) return '';

  const normalized = parts.map((p) => p.toLowerCase());

  // Strip .md extension from last part
  const last = normalized[normalized.length - 1];
  normalized[normalized.length - 1] = last.replace(/\.md$/, '');

  // If path starts with 'skills/', include rest of path
  // github.com/owner/repo/tree/main/skills/react -> react
  if (normalized[0] === 'skills' && normalized.length > 1) {
    return normalized.slice(1).join('/');
  }

  return normalized.join('/');
}

/**
 * Get the host type for routing fetch logic
 */
export function getHostType(parsed: ParsedSkillUrl): SkillHost {
  if (parsed.host === 'github.com') return 'github.com';
  return 'other';
}

/**
 * Validate that a string is a valid skill ID format
 */
export function isValidSkillId(id: string): boolean {
  // Must have at least host/something
  const parts = id.split('/');
  if (parts.length < 2) return false;

  // Host must look like a domain
  const host = parts[0];
  if (!host.includes('.')) return false;

  // No empty parts
  if (parts.some((p) => !p)) return false;

  return true;
}
