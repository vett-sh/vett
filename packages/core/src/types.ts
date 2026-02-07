import type { ScanStatus, RiskLevel } from './constants';

// Issue types for security analysis
export const ISSUE_TYPES = [
  'data_exfil',
  'identity_manipulation',
  'excessive_permissions',
  'obfuscation',
  'shell_execution',
  'arbitrary_network',
  'credential_access',
] as const;

export type IssueType = (typeof ISSUE_TYPES)[number];

// Security flag from analysis
export interface SecurityFlag {
  type: IssueType;
  evidence: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Permissions detected in a skill
export interface AnalysisPermissions {
  filesystem: string[];
  network: string[];
  env: string[];
}

// Full analysis result from the scanner
export interface AnalysisResult {
  v: 1; // Schema version - increment when structure changes
  risk: RiskLevel;
  permissions: AnalysisPermissions;
  flags: SecurityFlag[];
  summary: string;
}

export interface Skill {
  id: string;
  owner: string;
  repo: string | null;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  installCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  hash: string;
  artifactUrl: string;
  size: number;
  risk: RiskLevel | null;
  summary: string | null;
  analysis: AnalysisResult | null;
  gitRef: string | null;
  commitSha: string | null;
  sourceFingerprint: string | null;
  sigstoreBundle: unknown | null;
  analyzedAt: Date | null;
  scanStatus: ScanStatus;
  createdAt: Date;
}

// API response types
export interface SkillWithLatestVersion extends Skill {
  latestVersion: SkillVersion | null;
}

export interface SkillDetail extends Skill {
  versions: SkillVersion[];
}

// CLI types
export interface InstalledSkill {
  owner: string;
  repo: string | null;
  name: string;
  version: string;
  installedAt: Date;
  path: string;
  /** Agents this skill is installed to */
  agents?: string[];
  /** Installation scope: global (user-level) or project */
  scope?: 'global' | 'project';
}

export interface VettConfig {
  schemaVersion: number;
  installDir: string;
  registryUrl: string;
  telemetry: {
    enabled: boolean;
    deviceId?: string;
  };
}

export interface VettIndex {
  schemaVersion: number;
  installedSkills: InstalledSkill[];
}

// ============================================================================
// Well-Known Skills Discovery (Cloudflare RFC)
// https://github.com/cloudflare/agent-skills-discovery-rfc
// ============================================================================

/**
 * A skill entry from /.well-known/skills/index.json
 */
export interface WellKnownSkillEntry {
  /** Skill identifier (1-64 chars, lowercase alphanumeric + hyphens) */
  name: string;
  /** Brief description of what the skill does */
  description: string;
  /** Files included in the skill (SKILL.md must be first) */
  files: string[];
}

/**
 * The index served at /.well-known/skills/index.json
 */
export interface WellKnownIndex {
  skills: WellKnownSkillEntry[];
}
