import { describe, expect, it } from 'vitest';
import {
  agents,
  getAgentTypes,
  getAgentConfig,
  isValidAgentType,
  parseAgentTypes,
  type AgentType,
} from './agents';

describe('agents registry', () => {
  it('has at least 30 agents defined', () => {
    const agentTypes = getAgentTypes();
    expect(agentTypes.length).toBeGreaterThanOrEqual(30);
  });

  it('all agents have required fields', () => {
    for (const [type, config] of Object.entries(agents)) {
      expect(config.name).toBe(type);
      expect(config.displayName).toBeTruthy();
      expect(config.skillsDir).toBeTruthy();
      expect(typeof config.detectInstalled).toBe('function');
      // globalSkillsDir can be undefined (e.g., replit)
    }
  });

  it('agent names are kebab-case', () => {
    for (const type of getAgentTypes()) {
      expect(type).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('project skillsDir is a valid relative path', () => {
    for (const config of Object.values(agents)) {
      // Most project dirs are hidden (e.g., .claude/skills, .cursor/skills)
      // Some exceptions exist (e.g., openclaw uses 'skills')
      expect(config.skillsDir).toBeTruthy();
      expect(config.skillsDir).not.toMatch(/^\//); // Not absolute
      expect(config.skillsDir).not.toContain('..'); // No traversal
    }
  });
});

describe('getAgentConfig', () => {
  it('returns config for valid agent', () => {
    const config = getAgentConfig('claude-code');
    expect(config.name).toBe('claude-code');
    expect(config.displayName).toBe('Claude Code');
    expect(config.skillsDir).toBe('.claude/skills');
  });

  it('returns config for cursor', () => {
    const config = getAgentConfig('cursor');
    expect(config.displayName).toBe('Cursor');
    expect(config.skillsDir).toBe('.cursor/skills');
  });
});

describe('isValidAgentType', () => {
  it('returns true for valid agents', () => {
    expect(isValidAgentType('claude-code')).toBe(true);
    expect(isValidAgentType('cursor')).toBe(true);
    expect(isValidAgentType('codex')).toBe(true);
  });

  it('returns false for invalid agents', () => {
    expect(isValidAgentType('invalid-agent')).toBe(false);
    expect(isValidAgentType('')).toBe(false);
    expect(isValidAgentType('CLAUDE-CODE')).toBe(false); // case sensitive
  });
});

describe('parseAgentTypes', () => {
  it('parses valid agent types', () => {
    const result = parseAgentTypes(['claude-code', 'cursor']);
    expect(result.valid).toEqual(['claude-code', 'cursor']);
    expect(result.invalid).toEqual([]);
  });

  it('separates invalid from valid', () => {
    const result = parseAgentTypes(['claude-code', 'invalid', 'cursor', 'also-invalid']);
    expect(result.valid).toEqual(['claude-code', 'cursor']);
    expect(result.invalid).toEqual(['invalid', 'also-invalid']);
  });

  it('normalizes case', () => {
    const result = parseAgentTypes(['CLAUDE-CODE', 'Cursor']);
    expect(result.valid).toEqual(['claude-code', 'cursor']);
    expect(result.invalid).toEqual([]);
  });

  it('handles empty input', () => {
    const result = parseAgentTypes([]);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('trims whitespace', () => {
    const result = parseAgentTypes(['  claude-code  ', ' cursor ']);
    expect(result.valid).toEqual(['claude-code', 'cursor']);
  });
});

describe('specific agent configs', () => {
  const testCases: Array<{
    type: AgentType;
    displayName: string;
    skillsDir: string;
    hasGlobal: boolean;
  }> = [
    {
      type: 'claude-code',
      displayName: 'Claude Code',
      skillsDir: '.claude/skills',
      hasGlobal: true,
    },
    { type: 'cursor', displayName: 'Cursor', skillsDir: '.cursor/skills', hasGlobal: true },
    { type: 'codex', displayName: 'Codex', skillsDir: '.codex/skills', hasGlobal: true },
    { type: 'windsurf', displayName: 'Windsurf', skillsDir: '.windsurf/skills', hasGlobal: true },
    {
      type: 'github-copilot',
      displayName: 'GitHub Copilot',
      skillsDir: '.github/skills',
      hasGlobal: true,
    },
    { type: 'cline', displayName: 'Cline', skillsDir: '.cline/skills', hasGlobal: true },
    { type: 'roo', displayName: 'Roo Code', skillsDir: '.roo/skills', hasGlobal: true },
    { type: 'goose', displayName: 'Goose', skillsDir: '.goose/skills', hasGlobal: true },
    { type: 'replit', displayName: 'Replit', skillsDir: '.agent/skills', hasGlobal: false },
  ];

  for (const tc of testCases) {
    it(`${tc.type} has correct config`, () => {
      const config = getAgentConfig(tc.type);
      expect(config.displayName).toBe(tc.displayName);
      expect(config.skillsDir).toBe(tc.skillsDir);
      if (tc.hasGlobal) {
        expect(config.globalSkillsDir).toBeTruthy();
      } else {
        expect(config.globalSkillsDir).toBeUndefined();
      }
    });
  }
});
