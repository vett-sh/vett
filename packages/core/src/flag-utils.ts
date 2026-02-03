import type { SecurityFlag } from './types';

export interface FlagRankingOptions {
  severityWeights?: Partial<Record<SecurityFlag['severity'], number>>;
  typeWeights?: Partial<Record<SecurityFlag['type'], number>>;
}

const DEFAULT_SEVERITY_WEIGHTS: Record<SecurityFlag['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function rankSecurityFlags(
  flags: SecurityFlag[],
  options: FlagRankingOptions = {}
): SecurityFlag[] {
  const severityWeights = { ...DEFAULT_SEVERITY_WEIGHTS, ...options.severityWeights };
  const typeWeights = options.typeWeights ?? {};

  return [...flags].sort((a, b) => {
    const aScore = (severityWeights[a.severity] ?? 0) + (typeWeights[a.type] ?? 0);
    const bScore = (severityWeights[b.severity] ?? 0) + (typeWeights[b.type] ?? 0);
    if (bScore !== aScore) return bScore - aScore;
    if (b.severity !== a.severity) {
      return (severityWeights[b.severity] ?? 0) - (severityWeights[a.severity] ?? 0);
    }
    return a.type.localeCompare(b.type);
  });
}
