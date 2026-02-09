import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getSkillByRef } from '../api';
import { getInstalledSkill } from '../config';
import { UpgradeRequiredError } from '../errors';
import type { RiskLevel, AnalysisResult, SecurityFlag } from '@vett/core';

function parseSkillRef(ref: string): {
  owner: string;
  repo: string | null;
  name: string;
} {
  const parts = ref.split('/');
  if (parts.length === 3) {
    return { owner: parts[0], repo: parts[1], name: parts[2] };
  }
  if (parts.length === 2) {
    // Domain sources: owner/skill (owner contains a dot)
    return { owner: parts[0], repo: null, name: parts[1] };
  }
  throw new Error('Invalid skill reference. Format: owner/repo/skill or owner/skill');
}

function formatRisk(risk: RiskLevel): string {
  switch (risk) {
    case 'none':
    case 'low':
      return pc.green(risk.toUpperCase());
    case 'medium':
      return pc.yellow(risk.toUpperCase());
    case 'high':
    case 'critical':
      return pc.red(risk.toUpperCase());
  }
}

function formatFlagSeverity(severity: string): string {
  if (severity === 'critical' || severity === 'high') return pc.red(`[${severity.toUpperCase()}]`);
  if (severity === 'medium') return pc.yellow(`[${severity.toUpperCase()}]`);
  return pc.dim(`[${severity.toUpperCase()}]`);
}

export async function info(skillRef: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett info ')));

  let parsed;
  try {
    parsed = parseSkillRef(skillRef);
  } catch (error) {
    p.log.error((error as Error).message);
    p.outro(pc.red('Failed'));
    process.exit(1);
  }

  const { owner, repo, name } = parsed;

  const s = p.spinner();
  s.start('Fetching skill info');

  let skill;
  try {
    skill = await getSkillByRef(owner, repo, name);
  } catch (error) {
    s.stop('Failed');
    if (error instanceof UpgradeRequiredError) {
      p.outro(pc.red('Failed'));
      throw error;
    }
    p.log.error((error as Error).message);
    p.outro(pc.red('Failed'));
    process.exit(1);
  }
  const displayRef = repo ? `${owner}/${repo}/${name}` : `${owner}/${name}`;
  if (!skill) {
    s.stop('Not found');
    p.log.error(`Skill not found: ${displayRef}`);
    p.outro(pc.red('Failed'));
    process.exit(1);
  }

  s.stop('Found');

  // Check if installed locally
  const installed = repo ? getInstalledSkill(owner, repo, name) : null;

  // Build info display
  const lines: string[] = [];

  if (skill.description) {
    lines.push(pc.dim(skill.description));
    lines.push('');
  }

  lines.push(`${pc.dim('Installs:')} ${skill.installCount.toLocaleString()}`);
  if (installed) {
    lines.push(`${pc.dim('Installed:')} ${installed.version} ${pc.dim(`(${installed.path})`)}`);
  }

  // Latest version details (already included in getSkillByRef response)
  const version = skill.versions[0];
  if (version) {
    lines.push('');
    lines.push(`${pc.bold('Latest Version:')} ${version.version}`);

    if (version.risk) {
      lines.push(`${pc.dim('Risk:')} ${formatRisk(version.risk)}`);
    }

    if (version.summary) {
      lines.push('');
      lines.push(version.summary);
    }

    const analysis = version.analysis as AnalysisResult | null;
    if (analysis) {
      const hasPerms =
        analysis.permissions.filesystem.length > 0 ||
        analysis.permissions.network.length > 0 ||
        analysis.permissions.env.length > 0;

      if (hasPerms) {
        lines.push('');
        lines.push(pc.bold('Permissions'));
        if (analysis.permissions.filesystem.length > 0) {
          lines.push(`  ${pc.dim('Filesystem:')} ${analysis.permissions.filesystem.join(', ')}`);
        }
        if (analysis.permissions.network.length > 0) {
          lines.push(`  ${pc.dim('Network:')} ${analysis.permissions.network.join(', ')}`);
        }
        if (analysis.permissions.env.length > 0) {
          lines.push(`  ${pc.dim('Env:')} ${analysis.permissions.env.join(', ')}`);
        }
      }

      if (analysis.flags.length > 0) {
        lines.push('');
        lines.push(pc.bold('Security Flags'));
        for (const flag of analysis.flags as SecurityFlag[]) {
          lines.push(`  ${formatFlagSeverity(flag.severity)} ${flag.type}: ${flag.evidence}`);
        }
      }
    } else {
      lines.push(`${pc.dim('Scan status:')} ${version.scanStatus}`);
    }
  }

  // All versions
  if (skill.versions.length > 0) {
    lines.push('');
    lines.push(pc.bold('All Versions'));
    for (const v of skill.versions.slice(0, 10)) {
      const date = new Date(v.createdAt).toLocaleDateString();
      const riskBadge = v.risk ? ` ${formatRisk(v.risk)}` : '';
      lines.push(`  ${v.version} ${pc.dim(`(${date})`)}${riskBadge}`);
    }
    if (skill.versions.length > 10) {
      lines.push(pc.dim(`  ... and ${skill.versions.length - 10} more`));
    }
  }

  p.note(lines.join('\n'), displayRef);

  p.outro(pc.dim('Done'));
}
