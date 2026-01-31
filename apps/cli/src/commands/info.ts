import { getSkillByRef, getVersionDetail } from '../api.js';
import { getInstalledSkill } from '../config.js';
import type { RiskLevel } from '@vett/core';

function parseSkillRef(ref: string): { owner: string; repo: string; name: string } {
  const parts = ref.split('/');
  if (parts.length !== 3) {
    throw new Error('Invalid skill reference. Format: owner/repo/skill');
  }
  return { owner: parts[0], repo: parts[1], name: parts[2] };
}

function severityColor(severity: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    low: '\x1b[32m',     // green
    medium: '\x1b[33m',  // yellow
    high: '\x1b[91m',    // bright red
    critical: '\x1b[31m', // red
  };
  return colors[severity] || '';
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
    console.log(`${dim}Scan status:${reset} ${latestVersion.scanStatus}`);
    console.log();

    // Fetch full version details with permissions and scans
    try {
      const versionDetail = await getVersionDetail(skill.id, latestVersion.version);

      // Permissions
      if (versionDetail.permissions.length > 0) {
        console.log(`${bold}Permissions:${reset}`);
        for (const perm of versionDetail.permissions) {
          console.log(`  ${perm.type}: ${perm.access}${perm.details ? ` (${perm.details})` : ''}`);
        }
        console.log();
      }

      // Scan findings
      for (const scan of versionDetail.scans) {
        console.log(`${bold}Security Scan (${scan.engine}):${reset} ${scan.status}`);
        if (Array.isArray(scan.findings) && scan.findings.length > 0) {
          for (const finding of scan.findings as Array<{ rule: string; severity: RiskLevel; message: string }>) {
            const color = severityColor(finding.severity);
            console.log(`  ${color}[${finding.severity.toUpperCase()}]${reset} ${finding.rule}: ${finding.message}`);
          }
        } else {
          console.log('  No issues found');
        }
        console.log();
      }
    } catch {
      // Version details not available
    }
  }

  // All versions
  if (skill.versions.length > 0) {
    console.log(`${bold}All Versions:${reset}`);
    for (const v of skill.versions.slice(0, 10)) {
      const date = new Date(v.createdAt).toLocaleDateString();
      console.log(`  ${v.version} ${dim}(${date})${reset} - ${v.scanStatus}`);
    }
    if (skill.versions.length > 10) {
      console.log(`  ${dim}... and ${skill.versions.length - 10} more${reset}`);
    }
  }

  console.log();
}
