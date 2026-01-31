export const PERMISSION_TYPES = ['filesystem', 'network', 'env', 'shell'] as const;
export type PermissionType = (typeof PERMISSION_TYPES)[number];

export const ACCESS_LEVELS = ['none', 'read', 'write'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const SCAN_STATUSES = ['pending', 'scanning', 'completed', 'failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_ENGINES = ['yara', 'semgrep', 'custom'] as const;
export type ScanEngine = (typeof SCAN_ENGINES)[number];

export const SKILL_SOURCES = ['cursor', 'claude-code', 'github', 'custom'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
