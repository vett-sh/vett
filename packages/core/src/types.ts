import type {
  PermissionType,
  AccessLevel,
  ScanStatus,
  ScanEngine,
  SkillSource,
  RiskLevel,
} from './constants.js';

export interface Skill {
  id: string;
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  source: SkillSource;
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
  scannedAt: Date | null;
  scanStatus: ScanStatus;
  createdAt: Date;
}

export interface Permission {
  id: string;
  versionId: string;
  type: PermissionType;
  access: AccessLevel;
  details: string | null;
}

export interface ScanFinding {
  rule: string;
  severity: RiskLevel;
  message: string;
  line?: number;
  column?: number;
  snippet?: string;
}

export interface Scan {
  id: string;
  versionId: string;
  engine: ScanEngine;
  status: ScanStatus;
  findings: ScanFinding[];
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

// API response types
export interface SkillWithLatestVersion extends Skill {
  latestVersion: SkillVersion | null;
}

export interface SkillDetail extends Skill {
  versions: SkillVersion[];
}

export interface VersionDetail extends SkillVersion {
  permissions: Permission[];
  scans: Scan[];
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
