import { describe, expect, it } from 'vitest';
import {
  extractFrontmatter,
  extractMetadata,
  parseSkillVersion,
  parseSkillFile,
  isValidSkillName,
  slugifySkillName,
} from './skill-parser';

// ---------------------------------------------------------------------------
// extractFrontmatter
// ---------------------------------------------------------------------------
describe('extractFrontmatter', () => {
  it('extracts frontmatter and content', () => {
    const md = '---\nname: my-skill\n---\n# Hello';
    const result = extractFrontmatter(md);
    expect(result.frontmatter).toBe('name: my-skill');
    expect(result.content).toBe('# Hello');
  });

  it('returns null frontmatter when no delimiters', () => {
    const md = '# Just markdown\nNo frontmatter here.';
    const result = extractFrontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.content).toBe(md);
  });

  it('returns null frontmatter when only opening delimiter', () => {
    const md = '---\nname: broken';
    const result = extractFrontmatter(md);
    expect(result.frontmatter).toBeNull();
    expect(result.content).toBe(md);
  });

  it('handles leading whitespace', () => {
    const md = '  \n---\nname: my-skill\n---\n# Hello';
    const result = extractFrontmatter(md);
    expect(result.frontmatter).toBe('name: my-skill');
  });

  it('handles empty frontmatter', () => {
    const md = '---\n---\nContent';
    const result = extractFrontmatter(md);
    expect(result.frontmatter).toBe('');
    expect(result.content).toBe('Content');
  });

  it('handles multiline frontmatter', () => {
    const md = '---\nname: test\ndescription: A cool skill\nversion: 1.0.0\n---\n# Title';
    const result = extractFrontmatter(md);
    expect(result.frontmatter).toContain('name: test');
    expect(result.frontmatter).toContain('version: 1.0.0');
  });
});

// ---------------------------------------------------------------------------
// parseSkillVersion
// ---------------------------------------------------------------------------
describe('parseSkillVersion', () => {
  it('reads spec-compliant metadata.version', () => {
    expect(parseSkillVersion({ metadata: { version: '2.1.0' } })).toBe('2.1.0');
  });

  it('reads root version as fallback', () => {
    expect(parseSkillVersion({ version: '1.0.0' })).toBe('1.0.0');
  });

  it('prefers metadata.version over root version', () => {
    expect(
      parseSkillVersion({ version: '1.0.0', metadata: { version: '2.0.0' } })
    ).toBe('2.0.0');
  });

  it('coerces numeric version to string', () => {
    expect(parseSkillVersion({ version: 1.5 })).toBe('1.5');
    expect(parseSkillVersion({ metadata: { version: 3 } })).toBe('3');
  });

  it('returns null when no version present', () => {
    expect(parseSkillVersion({})).toBeNull();
    expect(parseSkillVersion({ name: 'test' })).toBeNull();
  });

  it('returns null for non-string non-number version', () => {
    expect(parseSkillVersion({ version: true })).toBeNull();
    expect(parseSkillVersion({ version: ['1.0'] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractMetadata
// ---------------------------------------------------------------------------
describe('extractMetadata', () => {
  it('extracts all fields', () => {
    const fm = {
      name: 'my-skill',
      description: 'Does things',
      version: '1.0.0',
      license: 'MIT',
      compatibility: 'claude',
      'allowed-tools': 'Bash Read',
    };
    const meta = extractMetadata(fm);
    expect(meta.name).toBe('my-skill');
    expect(meta.description).toBe('Does things');
    expect(meta.version).toBe('1.0.0');
    expect(meta.license).toBe('MIT');
    expect(meta.compatibility).toBe('claude');
    expect(meta.allowedTools).toBe('Bash Read');
  });

  it('returns empty metadata for empty frontmatter', () => {
    expect(extractMetadata({})).toEqual({});
  });

  it('ignores non-string values for string fields', () => {
    const meta = extractMetadata({ name: 123, description: true, license: ['MIT'] });
    expect(meta.name).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(meta.license).toBeUndefined();
  });

  it('handles allowed-tools as array', () => {
    const meta = extractMetadata({ 'allowed-tools': ['Bash', 'Read', 'Write'] });
    expect(meta.allowedTools).toBe('Bash Read Write');
  });

  it('handles allowedTools camelCase variant', () => {
    const meta = extractMetadata({ allowedTools: 'Bash Read' });
    expect(meta.allowedTools).toBe('Bash Read');
  });

  it('prefers allowed-tools over allowedTools', () => {
    const meta = extractMetadata({
      'allowed-tools': 'Bash',
      allowedTools: 'Read',
    });
    expect(meta.allowedTools).toBe('Bash');
  });
});

// ---------------------------------------------------------------------------
// parseSkillFile
// ---------------------------------------------------------------------------
describe('parseSkillFile', () => {
  it('parses a standard skill file', () => {
    const md = `---
name: linkedin
description: LinkedIn integration skill
version: 1.0.0
---
# LinkedIn Actions

Use this skill to interact with LinkedIn.`;

    const result = parseSkillFile(md);
    expect(result.metadata.name).toBe('linkedin');
    expect(result.metadata.description).toBe('LinkedIn integration skill');
    expect(result.metadata.version).toBe('1.0.0');
    expect(result.content).toContain('# LinkedIn Actions');
    expect(result.frontmatter).toHaveProperty('name', 'linkedin');
  });

  it('handles quoted values with special characters', () => {
    const md = `---
name: "WhatsApp Automation & A2A"
description: "MoltFlow — complete WhatsApp automation platform: sessions, messaging, groups."
---
# Content`;

    const result = parseSkillFile(md);
    expect(result.metadata.name).toBe('WhatsApp Automation & A2A');
    expect(result.metadata.description).toContain('MoltFlow');
  });

  it('gracefully handles unquoted colons (YAML parse failure)', () => {
    // Unquoted colons in YAML values cause a parse error in js-yaml/gray-matter.
    // Skill authors must quote descriptions containing colons.
    // parseSkillFile should not throw — it returns empty metadata.
    const md = `---
name: ds160-autofill
description: Use when user needs to: (1) fill forms (2) submit data
---
# DS-160`;

    const result = parseSkillFile(md);
    expect(result.metadata).toEqual({});
    expect(result.content).toContain('# DS-160');
  });

  it('handles inline JSON in metadata field', () => {
    const md = `---
name: "whatsapp-a2a"
metadata: {"openclaw":{"emoji":"📱","homepage":"https://waiflow.app"}}
---
# Content`;

    const result = parseSkillFile(md);
    expect(result.metadata.name).toBe('whatsapp-a2a');
    expect(result.frontmatter).toHaveProperty('metadata');
  });

  it('returns empty metadata when no frontmatter', () => {
    const md = '# Product Studio Shot\n\nJust markdown content.';
    const result = parseSkillFile(md);
    expect(result.metadata).toEqual({});
    expect(result.content).toContain('# Product Studio Shot');
  });

  it('returns empty metadata for invalid YAML', () => {
    const md = '---\n: : : garbage\n---\n# Content';
    const result = parseSkillFile(md);
    // gray-matter may recover or fail — either way we shouldn't crash
    expect(result.content).toBeDefined();
  });

  it('handles empty file', () => {
    const result = parseSkillFile('');
    expect(result.metadata).toEqual({});
    expect(result.content).toBe('');
  });

  it('handles frontmatter-only file (no body)', () => {
    const md = '---\nname: lonely\n---\n';
    const result = parseSkillFile(md);
    expect(result.metadata.name).toBe('lonely');
    expect(result.content).toBe('');
  });
});

// ---------------------------------------------------------------------------
// isValidSkillName
// ---------------------------------------------------------------------------
describe('isValidSkillName', () => {
  it('accepts valid names', () => {
    expect(isValidSkillName('linkedin')).toBe(true);
    expect(isValidSkillName('ds160-autofill')).toBe(true);
    expect(isValidSkillName('my-cool-skill-v2')).toBe(true);
    expect(isValidSkillName('a')).toBe(true);
    expect(isValidSkillName('a1')).toBe(true);
    expect(isValidSkillName('123')).toBe(true);
  });

  it('rejects names with uppercase', () => {
    expect(isValidSkillName('LinkedIn')).toBe(false);
    expect(isValidSkillName('MySkill')).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(isValidSkillName('my skill')).toBe(false);
    expect(isValidSkillName('WhatsApp Automation & A2A')).toBe(false);
  });

  it('rejects leading hyphen', () => {
    expect(isValidSkillName('-leading')).toBe(false);
  });

  it('rejects trailing hyphen', () => {
    expect(isValidSkillName('trailing-')).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(isValidSkillName('skill@v2')).toBe(false);
    expect(isValidSkillName('skill.name')).toBe(false);
    expect(isValidSkillName('skill_name')).toBe(false);
  });

  it('rejects names over 64 characters', () => {
    expect(isValidSkillName('a'.repeat(64))).toBe(true);
    expect(isValidSkillName('a'.repeat(65))).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSkillName('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// slugifySkillName
// ---------------------------------------------------------------------------
describe('slugifySkillName', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifySkillName('WhatsApp Automation & A2A')).toBe('whatsapp-automation-a2a');
  });

  it('passes through already-valid names', () => {
    expect(slugifySkillName('linkedin')).toBe('linkedin');
    expect(slugifySkillName('ds160-autofill')).toBe('ds160-autofill');
  });

  it('collapses consecutive non-alphanumeric chars into single hyphen', () => {
    expect(slugifySkillName('skill --- name')).toBe('skill-name');
    expect(slugifySkillName('a & b & c')).toBe('a-b-c');
  });

  it('strips leading/trailing special characters', () => {
    expect(slugifySkillName('---leading')).toBe('leading');
    expect(slugifySkillName('trailing---')).toBe('trailing');
    expect(slugifySkillName('  spaced  ')).toBe('spaced');
  });

  it('handles underscores and dots', () => {
    expect(slugifySkillName('my_cool.skill')).toBe('my-cool-skill');
  });

  it('truncates to 64 characters without trailing hyphen', () => {
    const long = 'a-'.repeat(40); // 80 chars
    const result = slugifySkillName(long);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result).not.toMatch(/-$/);
  });

  it('handles emoji and unicode', () => {
    expect(slugifySkillName('📱 WhatsApp Bot')).toBe('whatsapp-bot');
  });

  it('returns empty string for all-special input', () => {
    expect(slugifySkillName('---')).toBe('');
    expect(slugifySkillName('!@#$%')).toBe('');
  });
});
