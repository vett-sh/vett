import { getSkillByRef, getVersion } from '../api';
import { getInstalledSkill } from '../config';
import type { RiskLevel, AnalysisResult, SecurityFlag } from '@vett/core';

function parseSkillRef(ref: string): {
  owner: string;
  repo: string;
  name: string;
} {
  const parts = ref.split('/');
  if (parts.length !== 3) {
    throw new Error('Invalid skill reference. Format: owner/repo/skill');
  }
  return { owner: parts[0], repo: parts[1], name: parts[2] };
}

function riskColor(risk: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    none: '\x1b[32m', // green
    low: '\x1b[32m', // green
    medium: '\x1b[33m', // yellow
    high: '\x1b[91m', // bright red
    critical: '\x1b[31m', // red
  };
  return colors[risk] || '';
}

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';

export async function info(skillRef: string): Promise<void> {
  let parsed;
  try {
    parsed = parseSkillRef(skillRef);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }

  const { owner, repo, name } = parsed;

  // Fetch skill info
  const skill = await getSkillByRef(owner, repo, name);
  if (!skill) {
    console.error(`Skill not found: ${owner}/${repo}/${name}`);
    process.exit(1);
  }

  // Check if installed locally
  const installed = getInstalledSkill(owner, repo, name);

  // Header
  console.log(`\n${bold}${owner}/${repo}/${name}${reset}`);
  if (skill.description) {
    console.log(`${dim}${skill.description}${reset}`);
  }
  console.log();

  // Stats
  console.log(`${dim}Source:${reset}   ${skill.source}`);
  console.log(`${dim}Installs:${reset} ${skill.installCount.toLocaleString()}`);
  if (installed) {
    console.log(`${dim}Installed:${reset} ${installed.version} (${installed.path})`);
  }
  console.log();

  // Get latest version details
  const latestVersion = skill.versions[0];
  if (latestVersion) {
    console.log(`${bold}Latest Version: ${latestVersion.version}${reset}`);

    // Fetch full version with analysis
    try {
      const version = await getVersion(skill.id, latestVersion.version);

      // Risk level
      if (version.risk) {
        const color = riskColor(version.risk);
        console.log(`${dim}Risk:${reset} ${color}${version.risk.toUpperCase()}${reset}`);
      }

      // Summary
      if (version.summary) {
        console.log(`\n${version.summary}`);
      }

      // Analysis details
      const analysis = version.analysis as AnalysisResult | null;
      if (analysis) {
        // Permissions
        const hasPerms =
          analysis.permissions.filesystem.length > 0 ||
          analysis.permissions.network.length > 0 ||
          analysis.permissions.env.length > 0;

        if (hasPerms) {
          console.log(`\n${bold}Permissions:${reset}`);
          if (analysis.permissions.filesystem.length > 0) {
            console.log(
              `  ${dim}Filesystem:${reset} ${analysis.permissions.filesystem.join(', ')}`
            );
          }
          if (analysis.permissions.network.length > 0) {
            console.log(`  ${dim}Network:${reset} ${analysis.permissions.network.join(', ')}`);
          }
          if (analysis.permissions.env.length > 0) {
            console.log(`  ${dim}Env:${reset} ${analysis.permissions.env.join(', ')}`);
          }
        }

        // Security flags
        if (analysis.flags.length > 0) {
          console.log(`\n${bold}Security Flags:${reset}`);
          for (const flag of analysis.flags as SecurityFlag[]) {
            const color = riskColor(flag.severity);
            console.log(
              `  ${color}[${flag.severity.toUpperCase()}]${reset} ${flag.type}: ${flag.evidence}`
            );
          }
        }
      }
      console.log();
    } catch {
      // Version details not available
      console.log(`${dim}Scan status:${reset} ${latestVersion.scanStatus}`);
      console.log();
    }
  }

  // All versions
  if (skill.versions.length > 0) {
    console.log(`${bold}All Versions:${reset}`);
    for (const v of skill.versions.slice(0, 10)) {
      const date = new Date(v.createdAt).toLocaleDateString();
      const riskBadge = v.risk ? ` ${riskColor(v.risk)}[${v.risk}]${reset}` : '';
      console.log(`  ${v.version} ${dim}(${date})${reset}${riskBadge}`);
    }
    if (skill.versions.length > 10) {
      console.log(`  ${dim}... and ${skill.versions.length - 10} more${reset}`);
    }
  }

  console.log();
}
