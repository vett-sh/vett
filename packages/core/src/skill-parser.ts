import yaml from 'js-yaml';

/**
 * Metadata extracted from SKILL.md frontmatter
 */
export interface SkillMetadata {
  name?: string;
  description?: string;
  version?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
}

/**
 * Parsed skill file with frontmatter and content separated
 */
export interface ParsedSkillFile {
  frontmatter: Record<string, unknown>;
  metadata: SkillMetadata;
  content: string;
}

/**
 * Extract YAML frontmatter from markdown content
 *
 * Frontmatter is delimited by --- at the start of the file:
 * ```
 * ---
 * name: my-skill
 * description: Does something
 * ---
 * # My Skill
 * Content here...
 * ```
 */
export function extractFrontmatter(markdown: string): {
  frontmatter: string | null;
  content: string;
} {
  const trimmed = markdown.trimStart();

  // Must start with ---
  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, content: markdown };
  }

  // Find closing ---
  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, content: markdown };
  }

  const frontmatter = trimmed.slice(4, endIndex).trim();
  const content = trimmed.slice(endIndex + 4).trim();

  return { frontmatter, content };
}

/**
 * Parse YAML frontmatter string into an object
 */
export function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  try {
    const parsed = yaml.load(frontmatter);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Extract version from frontmatter (lenient parsing)
 *
 * Supports:
 * - metadata.version (AgentSkills spec)
 * - version (common variation)
 */
export function parseSkillVersion(frontmatter: Record<string, unknown>): string | null {
  // Spec-compliant: metadata.version
  const metadata = frontmatter.metadata;
  if (typeof metadata === 'object' && metadata !== null) {
    const version = (metadata as Record<string, unknown>).version;
    if (typeof version === 'string') return version;
    if (typeof version === 'number') return String(version);
  }

  // Common variation: root version
  const version = frontmatter.version;
  if (typeof version === 'string') return version;
  if (typeof version === 'number') return String(version);

  return null;
}

/**
 * Extract structured metadata from frontmatter
 */
export function extractMetadata(frontmatter: Record<string, unknown>): SkillMetadata {
  const metadata: SkillMetadata = {};

  // Name
  if (typeof frontmatter.name === 'string') {
    metadata.name = frontmatter.name;
  }

  // Description
  if (typeof frontmatter.description === 'string') {
    metadata.description = frontmatter.description;
  }

  // Version (lenient)
  const version = parseSkillVersion(frontmatter);
  if (version) {
    metadata.version = version;
  }

  // License
  if (typeof frontmatter.license === 'string') {
    metadata.license = frontmatter.license;
  }

  // Compatibility
  if (typeof frontmatter.compatibility === 'string') {
    metadata.compatibility = frontmatter.compatibility;
  }

  // Allowed tools (could be string or array)
  const allowedTools = frontmatter['allowed-tools'] ?? frontmatter.allowedTools;
  if (typeof allowedTools === 'string') {
    metadata.allowedTools = allowedTools;
  } else if (Array.isArray(allowedTools)) {
    metadata.allowedTools = allowedTools.join(' ');
  }

  return metadata;
}

/**
 * Parse a SKILL.md file, extracting frontmatter and metadata
 */
export function parseSkillFile(markdown: string): ParsedSkillFile {
  const { frontmatter: frontmatterStr, content } = extractFrontmatter(markdown);

  if (!frontmatterStr) {
    return {
      frontmatter: {},
      metadata: {},
      content: markdown,
    };
  }

  const frontmatter = parseFrontmatter(frontmatterStr);
  const metadata = extractMetadata(frontmatter);

  return { frontmatter, metadata, content };
}
