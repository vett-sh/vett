/**
 * URL parser for skill sources
 *
 * Normalizes any skill source URL to a canonical Vett identity.
 * Supports GitHub, ClawHub, and domain-hosted skills (.well-known, skill.md).
 *
 * Identity model:
 *   GitHub:       owner = org,    repo = repository,   skill = name
 *   Registries:   owner = domain, repo = publisher,    skill = slug
 *   Domain-hosted: owner = domain, repo = path|null,   skill = name
 *
 * Namespace rule: owner containing a dot is a domain source.
 * GitHub usernames cannot contain dots, so this is unambiguous.
 */

import psl from 'psl';

export interface ParsedSkillUrl {
  /** Host domain (github.com, clawhub.ai, mintlify.com) */
  host: string;
  /** Full normalized ID (host/owner/repo/skill or host/owner/skill) */
  id: string;
  /** Skill owner — GitHub org or registrable domain */
  owner: string;
  /** Repository or publisher grouping (undefined for root domain skills) */
  repo?: string;
  /** Normalized skill name (path-derived; ingest may override with frontmatter) */
  skill?: string;
  /** Full path within repo (for fetching from GitHub) */
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
 * // => { owner: 'vercel-labs', repo: 'agent-skills', skill: 'react', ... }
 *
 * @example
 * parseSkillUrl('https://clawhub.ai/Callmedas69/credential-manager')
 * // => { owner: 'clawhub.ai', repo: 'callmedas69', skill: 'credential-manager', ... }
 *
 * @example
 * parseSkillUrl('https://docs.cdp.coinbase.com/.well-known/skills/default/skill.md')
 * // => { owner: 'coinbase.com', skill: 'default', ... }
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

  if (host === 'clawhub.ai') {
    return parseClawHubUrl(parsed, sourceUrl);
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

  // Shorthand: owner/repo/skill -> try GitHub (no dots in first segment)
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
 * Extract the registrable domain from a hostname using the Public Suffix List.
 *
 * Examples:
 *   docs.cdp.coinbase.com  -> coinbase.com
 *   docs.x.com             -> x.com
 *   mintlify.com           -> mintlify.com
 *   anthropics.github.io   -> anthropics.github.io  (github.io is a public suffix)
 *   my-app.vercel.app      -> my-app.vercel.app     (vercel.app is a public suffix)
 */
export function getRegistrableDomain(host: string): string {
  const parsed = psl.parse(host);
  if ('domain' in parsed && parsed.domain) {
    return parsed.domain;
  }
  // Fallback to the full host if PSL can't parse it
  return host;
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
 * Parse ClawHub registry URLs
 *
 * Identity: owner = 'clawhub.ai', repo = publisher handle, skill = slug
 *
 * Formats:
 * - clawhub.ai/{publisher}/{slug}       (site URL — preferred)
 * - clawhub.ai/api/v1/download?slug=... (download URL — legacy)
 */
function parseClawHubUrl(parsed: URL, sourceUrl: string): ParsedSkillUrl {
  const pathParts = parsed.pathname.split('/').filter(Boolean);

  // Site URL: clawhub.ai/{publisher}/{slug}
  if (pathParts.length === 2 && pathParts[0] !== 'api') {
    const publisher = pathParts[0].toLowerCase();
    const slug = pathParts[1].toLowerCase();
    return {
      host: 'clawhub.ai',
      id: `clawhub.ai/${publisher}/${slug}`,
      owner: 'clawhub.ai',
      repo: publisher,
      skill: slug,
      sourceUrl,
    };
  }

  // Download URL: clawhub.ai/api/v1/download?slug=...&tag=...
  const slug = parsed.searchParams.get('slug')?.toLowerCase();
  if (!slug) {
    throw new Error(
      'Invalid ClawHub URL: expected clawhub.ai/{publisher}/{slug} or download URL with ?slug='
    );
  }

  const tag = parsed.searchParams.get('tag') || undefined;

  return {
    host: 'clawhub.ai',
    id: `clawhub.ai/clawhub/${slug}`,
    owner: 'clawhub.ai',
    repo: 'clawhub',
    skill: slug,
    ref: tag,
    sourceUrl,
  };
}

/**
 * Parse domain-hosted skill URLs
 *
 * Identity: owner = registrable domain, repo = path group (or undefined), skill = name
 *
 * Formats:
 * - example.com/skill.md                              -> owner=example.com, skill=example
 * - example.com/docs/skill.md                         -> owner=example.com, repo=docs, skill=docs
 * - example.com/.well-known/skills/default/skill.md   -> owner=example.com, skill=default
 * - example.com/docs/frontend.md                      -> owner=example.com, repo=docs, skill=frontend
 */
function parseHttpUrl(host: string, pathParts: string[], sourceUrl: string): ParsedSkillUrl {
  const owner = getRegistrableDomain(host);
  const normalized = pathParts.map((p) => p.toLowerCase());

  // Strip .md extension from last part
  if (normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    normalized[normalized.length - 1] = last.replace(/\.md$/, '');
  }

  // Check for .well-known/skills convention — strip protocol prefix
  const wellKnownIdx = normalized.indexOf('.well-known');
  if (wellKnownIdx !== -1 && normalized[wellKnownIdx + 1] === 'skills') {
    // .well-known/skills/{dir}/skill.md -> just {dir}/skill.md
    const afterWellKnown = normalized.slice(wellKnownIdx + 2);
    return parseHttpPath(owner, host, afterWellKnown, sourceUrl);
  }

  return parseHttpPath(owner, host, normalized, sourceUrl);
}

/**
 * Parse the path portion of an HTTP-hosted skill URL into identity fields.
 */
function parseHttpPath(
  owner: string,
  host: string,
  normalized: string[],
  sourceUrl: string
): ParsedSkillUrl {
  const hostBase = owner.split('.')[0];

  let repo: string | undefined;
  let skill: string;

  if (normalized.length === 0) {
    // Bare domain (example.com/)
    skill = hostBase;
  } else if (normalized.length === 1) {
    // Single component (example.com/skill.md or example.com/frontend.md)
    skill = normalized[0] === 'skill' ? hostBase : normalized[0];
  } else {
    // Multiple components
    const filename = normalized[normalized.length - 1];
    const parentPath = normalized.slice(0, -1);

    if (filename === 'skill') {
      // skill.md convention: directory containing skill.md IS the skill
      if (parentPath.length === 1) {
        // docs/skill.md -> repo=docs, skill=docs
        repo = parentPath[0];
        skill = parentPath[0];
      } else {
        // path/to/docs/skill.md -> repo=path/to, skill=docs
        repo = parentPath.slice(0, -1).join('/');
        skill = parentPath[parentPath.length - 1];
      }
    } else {
      // Named file: docs/frontend.md -> repo=docs, skill=frontend
      repo = parentPath.join('/');
      skill = filename;
    }
  }

  // Build ID — include repo only if present
  const idParts = [host, owner];
  if (repo) idParts.push(repo);
  idParts.push(skill);
  const id = idParts.join('/');

  return {
    host,
    id,
    owner,
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
