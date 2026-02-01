export const SCAN_STATUSES = ['pending', 'analyzing', 'completed', 'failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SKILL_SOURCES = ['cursor', 'claude-code', 'github', 'custom'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

export const RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
