import type { ScanStatus, SkillSource, RiskLevel } from './constants';

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
  repo: string;
  name: string;
  description: string | null;
  source: SkillSource;
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
  signatureHash: string | null;
  signature: string | null;
  signatureKeyId: string | null;
  signatureCreatedAt: Date | null;
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
  repo: string;
  name: string;
  version: string;
  installedAt: Date;
  path: string;
}

export interface VettConfig {
  installDir: string;
  registryUrl: string;
  installedSkills: InstalledSkill[];
}
