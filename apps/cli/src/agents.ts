/**
 * Agent registry and detection
 *
 * Defines supported AI coding agents and their skill directory locations.
 * Used to install vett skills to the correct locations for each agent.
 *
 * Adapted from vercel-labs/skills (MIT License)
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Supported agent identifiers.
 * Add new agents here and in the `agents` registry below.
 */
export type AgentType =
  // Tier 1: Major agents with wide adoption
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'windsurf'
  | 'github-copilot'
  | 'cline'
  | 'roo'
  | 'goose'
  | 'continue'
  | 'zencoder'
  | 'augment'
  | 'replit'
  | 'codeium'
  // Tier 2: Established agents
  | 'amp'
  | 'kilo'
  | 'gemini-cli'
  | 'trae'
  | 'opencode'
  | 'aider'
  | 'void'
  | 'pear'
  | 'junie'
  | 'mux'
  | 'qodo'
  | 'aide'
  // Tier 3: Additional agents
  | 'antigravity'
  | 'openclaw'
  | 'codebuddy'
  | 'command-code'
  | 'crush'
  | 'droid'
  | 'iflow-cli'
  | 'kimi-cli'
  | 'kiro-cli'
  | 'kode'
  | 'mcpjam'
  | 'mistral-vibe'
  | 'openclaude'
  | 'openhands'
  | 'pi'
  | 'qoder'
  | 'qwen-code'
  | 'trae-cn'
  | 'neovate'
  | 'pochi'
  | 'adal';

/**
 * Configuration for an AI coding agent.
 */
export interface AgentConfig {
  /** Internal identifier */
  name: AgentType;
  /** Human-readable name */
  displayName: string;
  /** Project-level skills directory (relative to project root) */
  skillsDir: string;
  /** Global skills directory (absolute path), undefined if not supported */
  globalSkillsDir: string | undefined;
  /** Async function to detect if this agent is installed */
  detectInstalled: () => Promise<boolean>;
}

// Common paths
const home = homedir();

// Environment variable overrides
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex');

/**
 * Registry of all supported agents with their configurations.
 */
export const agents: Record<AgentType, AgentConfig> = {
  'claude-code': {
    name: 'claude-code',
    displayName: 'Claude Code',
    skillsDir: '.claude/skills',
    globalSkillsDir: join(claudeHome, 'skills'),
    detectInstalled: async () => existsSync(claudeHome),
  },

  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    skillsDir: '.cursor/skills',
    globalSkillsDir: join(home, '.cursor/skills'),
    detectInstalled: async () => existsSync(join(home, '.cursor')),
  },

  codex: {
    name: 'codex',
    displayName: 'Codex',
    skillsDir: '.codex/skills',
    globalSkillsDir: join(codexHome, 'skills'),
    detectInstalled: async () => existsSync(codexHome) || existsSync('/etc/codex'),
  },

  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    skillsDir: '.windsurf/skills',
    globalSkillsDir: join(home, '.codeium/windsurf/skills'),
    detectInstalled: async () => existsSync(join(home, '.codeium/windsurf')),
  },

  'github-copilot': {
    name: 'github-copilot',
    displayName: 'GitHub Copilot',
    skillsDir: '.github/skills',
    globalSkillsDir: join(home, '.copilot/skills'),
    detectInstalled: async () =>
      existsSync(join(process.cwd(), '.github')) || existsSync(join(home, '.copilot')),
  },

  cline: {
    name: 'cline',
    displayName: 'Cline',
    skillsDir: '.cline/skills',
    globalSkillsDir: join(home, '.cline/skills'),
    detectInstalled: async () => existsSync(join(home, '.cline')),
  },

  roo: {
    name: 'roo',
    displayName: 'Roo Code',
    skillsDir: '.roo/skills',
    globalSkillsDir: join(home, '.roo/skills'),
    detectInstalled: async () => existsSync(join(home, '.roo')),
  },

  goose: {
    name: 'goose',
    displayName: 'Goose',
    skillsDir: '.goose/skills',
    globalSkillsDir: join(home, '.config/goose/skills'),
    detectInstalled: async () => existsSync(join(home, '.config/goose')),
  },

  amp: {
    name: 'amp',
    displayName: 'Amp',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.config/agents/skills'),
    detectInstalled: async () => existsSync(join(home, '.config/amp')),
  },

  continue: {
    name: 'continue',
    displayName: 'Continue',
    skillsDir: '.continue/skills',
    globalSkillsDir: join(home, '.continue/skills'),
    detectInstalled: async () =>
      existsSync(join(process.cwd(), '.continue')) || existsSync(join(home, '.continue')),
  },

  zencoder: {
    name: 'zencoder',
    displayName: 'Zencoder',
    skillsDir: '.zencoder/skills',
    globalSkillsDir: join(home, '.zencoder/skills'),
    detectInstalled: async () => existsSync(join(home, '.zencoder')),
  },

  augment: {
    name: 'augment',
    displayName: 'Augment',
    skillsDir: '.augment/rules',
    globalSkillsDir: join(home, '.augment/rules'),
    detectInstalled: async () => existsSync(join(home, '.augment')),
  },

  kilo: {
    name: 'kilo',
    displayName: 'Kilo Code',
    skillsDir: '.kilocode/skills',
    globalSkillsDir: join(home, '.kilocode/skills'),
    detectInstalled: async () => existsSync(join(home, '.kilocode')),
  },

  'gemini-cli': {
    name: 'gemini-cli',
    displayName: 'Gemini CLI',
    skillsDir: '.gemini/skills',
    globalSkillsDir: join(home, '.gemini/skills'),
    detectInstalled: async () => existsSync(join(home, '.gemini')),
  },

  trae: {
    name: 'trae',
    displayName: 'Trae',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae/skills'),
    detectInstalled: async () => existsSync(join(home, '.trae')),
  },

  opencode: {
    name: 'opencode',
    displayName: 'OpenCode',
    skillsDir: '.opencode/skills',
    globalSkillsDir: join(home, '.config/opencode/skills'),
    detectInstalled: async () =>
      existsSync(join(home, '.config/opencode')) || existsSync(join(claudeHome, 'skills')),
  },

  aider: {
    name: 'aider',
    displayName: 'Aider',
    skillsDir: '.aider/skills',
    globalSkillsDir: join(home, '.aider/skills'),
    detectInstalled: async () => existsSync(join(home, '.aider')),
  },

  void: {
    name: 'void',
    displayName: 'Void',
    skillsDir: '.void/skills',
    globalSkillsDir: join(home, '.void/skills'),
    detectInstalled: async () => existsSync(join(home, '.void')),
  },

  pear: {
    name: 'pear',
    displayName: 'Pear',
    skillsDir: '.pear/skills',
    globalSkillsDir: join(home, '.pear/skills'),
    detectInstalled: async () => existsSync(join(home, '.pear')),
  },

  junie: {
    name: 'junie',
    displayName: 'Junie',
    skillsDir: '.junie/skills',
    globalSkillsDir: join(home, '.junie/skills'),
    detectInstalled: async () => existsSync(join(home, '.junie')),
  },

  mux: {
    name: 'mux',
    displayName: 'Mux',
    skillsDir: '.mux/skills',
    globalSkillsDir: join(home, '.mux/skills'),
    detectInstalled: async () => existsSync(join(home, '.mux')),
  },

  qodo: {
    name: 'qodo',
    displayName: 'Qodo',
    skillsDir: '.qodo/skills',
    globalSkillsDir: join(home, '.qodo/skills'),
    detectInstalled: async () => existsSync(join(home, '.qodo')),
  },

  replit: {
    name: 'replit',
    displayName: 'Replit',
    skillsDir: '.agent/skills',
    globalSkillsDir: undefined, // Replit is project-only
    detectInstalled: async () => existsSync(join(process.cwd(), '.agent')),
  },

  codeium: {
    name: 'codeium',
    displayName: 'Codeium',
    skillsDir: '.codeium/skills',
    globalSkillsDir: join(home, '.codeium/skills'),
    detectInstalled: async () => existsSync(join(home, '.codeium')),
  },

  aide: {
    name: 'aide',
    displayName: 'Aide',
    skillsDir: '.aide/skills',
    globalSkillsDir: join(home, '.aide/skills'),
    detectInstalled: async () => existsSync(join(home, '.aide')),
  },

  // Additional agents
  antigravity: {
    name: 'antigravity',
    displayName: 'Antigravity',
    skillsDir: '.agent/skills',
    globalSkillsDir: join(home, '.gemini/antigravity/global_skills'),
    detectInstalled: async () =>
      existsSync(join(process.cwd(), '.agent')) || existsSync(join(home, '.gemini/antigravity')),
  },

  openclaw: {
    name: 'openclaw',
    displayName: 'OpenClaw',
    skillsDir: 'skills',
    globalSkillsDir: join(home, '.moltbot/skills'),
    detectInstalled: async () =>
      existsSync(join(home, '.openclaw')) ||
      existsSync(join(home, '.clawdbot')) ||
      existsSync(join(home, '.moltbot')),
  },

  codebuddy: {
    name: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: join(home, '.codebuddy/skills'),
    detectInstalled: async () =>
      existsSync(join(process.cwd(), '.codebuddy')) || existsSync(join(home, '.codebuddy')),
  },

  'command-code': {
    name: 'command-code',
    displayName: 'Command Code',
    skillsDir: '.commandcode/skills',
    globalSkillsDir: join(home, '.commandcode/skills'),
    detectInstalled: async () => existsSync(join(home, '.commandcode')),
  },

  crush: {
    name: 'crush',
    displayName: 'Crush',
    skillsDir: '.crush/skills',
    globalSkillsDir: join(home, '.config/crush/skills'),
    detectInstalled: async () => existsSync(join(home, '.config/crush')),
  },

  droid: {
    name: 'droid',
    displayName: 'Droid',
    skillsDir: '.factory/skills',
    globalSkillsDir: join(home, '.factory/skills'),
    detectInstalled: async () => existsSync(join(home, '.factory')),
  },

  'iflow-cli': {
    name: 'iflow-cli',
    displayName: 'iFlow CLI',
    skillsDir: '.iflow/skills',
    globalSkillsDir: join(home, '.iflow/skills'),
    detectInstalled: async () => existsSync(join(home, '.iflow')),
  },

  'kimi-cli': {
    name: 'kimi-cli',
    displayName: 'Kimi Code CLI',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.config/agents/skills'),
    detectInstalled: async () => existsSync(join(home, '.kimi')),
  },

  'kiro-cli': {
    name: 'kiro-cli',
    displayName: 'Kiro CLI',
    skillsDir: '.kiro/skills',
    globalSkillsDir: join(home, '.kiro/skills'),
    detectInstalled: async () => existsSync(join(home, '.kiro')),
  },

  kode: {
    name: 'kode',
    displayName: 'Kode',
    skillsDir: '.kode/skills',
    globalSkillsDir: join(home, '.kode/skills'),
    detectInstalled: async () => existsSync(join(home, '.kode')),
  },

  mcpjam: {
    name: 'mcpjam',
    displayName: 'MCPJam',
    skillsDir: '.mcpjam/skills',
    globalSkillsDir: join(home, '.mcpjam/skills'),
    detectInstalled: async () => existsSync(join(home, '.mcpjam')),
  },

  'mistral-vibe': {
    name: 'mistral-vibe',
    displayName: 'Mistral Vibe',
    skillsDir: '.vibe/skills',
    globalSkillsDir: join(home, '.vibe/skills'),
    detectInstalled: async () => existsSync(join(home, '.vibe')),
  },

  openclaude: {
    name: 'openclaude',
    displayName: 'OpenClaude IDE',
    skillsDir: '.openclaude/skills',
    globalSkillsDir: join(home, '.openclaude/skills'),
    detectInstalled: async () =>
      existsSync(join(home, '.openclaude')) || existsSync(join(process.cwd(), '.openclaude')),
  },

  openhands: {
    name: 'openhands',
    displayName: 'OpenHands',
    skillsDir: '.openhands/skills',
    globalSkillsDir: join(home, '.openhands/skills'),
    detectInstalled: async () => existsSync(join(home, '.openhands')),
  },

  pi: {
    name: 'pi',
    displayName: 'Pi',
    skillsDir: '.pi/skills',
    globalSkillsDir: join(home, '.pi/agent/skills'),
    detectInstalled: async () => existsSync(join(home, '.pi/agent')),
  },

  qoder: {
    name: 'qoder',
    displayName: 'Qoder',
    skillsDir: '.qoder/skills',
    globalSkillsDir: join(home, '.qoder/skills'),
    detectInstalled: async () => existsSync(join(home, '.qoder')),
  },

  'qwen-code': {
    name: 'qwen-code',
    displayName: 'Qwen Code',
    skillsDir: '.qwen/skills',
    globalSkillsDir: join(home, '.qwen/skills'),
    detectInstalled: async () => existsSync(join(home, '.qwen')),
  },

  'trae-cn': {
    name: 'trae-cn',
    displayName: 'Trae CN',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae-cn/skills'),
    detectInstalled: async () => existsSync(join(home, '.trae-cn')),
  },

  neovate: {
    name: 'neovate',
    displayName: 'Neovate',
    skillsDir: '.neovate/skills',
    globalSkillsDir: join(home, '.neovate/skills'),
    detectInstalled: async () => existsSync(join(home, '.neovate')),
  },

  pochi: {
    name: 'pochi',
    displayName: 'Pochi',
    skillsDir: '.pochi/skills',
    globalSkillsDir: join(home, '.pochi/skills'),
    detectInstalled: async () => existsSync(join(home, '.pochi')),
  },

  adal: {
    name: 'adal',
    displayName: 'AdaL',
    skillsDir: '.adal/skills',
    globalSkillsDir: join(home, '.adal/skills'),
    detectInstalled: async () => existsSync(join(home, '.adal')),
  },
};

/**
 * Get all agent type identifiers.
 */
export function getAgentTypes(): AgentType[] {
  return Object.keys(agents) as AgentType[];
}

/**
 * Get configuration for a specific agent.
 */
export function getAgentConfig(type: AgentType): AgentConfig {
  return agents[type];
}

/**
 * Detect which agents are installed on the system.
 * Runs all detection functions in parallel.
 */
export async function detectInstalledAgents(): Promise<AgentType[]> {
  const results = await Promise.all(
    Object.entries(agents).map(async ([type, config]) => ({
      type: type as AgentType,
      installed: await config.detectInstalled(),
    }))
  );

  return results.filter((r) => r.installed).map((r) => r.type);
}

/**
 * Check if an agent type string is valid.
 */
export function isValidAgentType(type: string): type is AgentType {
  return type in agents;
}

/**
 * Parse and validate agent type strings from CLI input.
 * Returns valid agents and any invalid inputs.
 */
export function parseAgentTypes(inputs: string[]): {
  valid: AgentType[];
  invalid: string[];
} {
  const valid: AgentType[] = [];
  const invalid: string[] = [];

  for (const input of inputs) {
    const normalized = input.toLowerCase().trim();
    if (isValidAgentType(normalized)) {
      valid.push(normalized);
    } else {
      invalid.push(input);
    }
  }

  return { valid, invalid };
}
