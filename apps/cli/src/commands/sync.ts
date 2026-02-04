import { existsSync } from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadIndex, saveIndex } from '../config';
import { agents, detectInstalledAgents, type AgentType } from '../agents';
import {
  installToAgent,
  getAgentSkillPath,
  checkSymlinkStatus,
  type SymlinkStatus,
} from '../installer';
import type { InstalledSkill } from '@vett/core';

interface SyncIssue {
  skill: InstalledSkill;
  agent: AgentType;
  issue: Exclude<SymlinkStatus, 'ok' | 'copy'>;
  path: string;
}

/**
 * Sync agent symlinks for all installed skills.
 *
 * Detects and fixes:
 * - Missing symlinks (agent dir deleted)
 * - Broken symlinks (canonical dir deleted)
 * - Wrong targets (symlink points elsewhere)
 */
export async function sync(options: { fix?: boolean; addNew?: boolean }): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' vett sync ')));

  const s = p.spinner();

  // Load config and detect agents
  s.start('Scanning installations');
  const index = loadIndex();
  const skills = index.installedSkills;

  if (skills.length === 0) {
    s.stop('No skills installed');
    p.outro(pc.dim('Nothing to sync'));
    return;
  }

  const detectedAgents = await detectInstalledAgents();
  const issues: SyncIssue[] = [];
  const newAgentSkills: Array<{ skill: InstalledSkill; agent: AgentType }> = [];

  // Check each skill's agent symlinks
  for (const skill of skills) {
    const skillAgents = (skill.agents || []) as AgentType[];
    const scope = skill.scope || 'global';
    const isGlobal = scope === 'global';

    // Check existing agent installations
    for (const agentType of skillAgents) {
      const pathInfo = getAgentSkillPath(skill.name, agentType, { global: isGlobal });
      if (!pathInfo) continue;

      const status = await checkSymlinkStatus(pathInfo.skillDir, skill.path);

      if (status !== 'ok' && status !== 'copy') {
        issues.push({
          skill,
          agent: agentType,
          issue: status,
          path: pathInfo.skillDir,
        });
      }
    }

    // Check for newly detected agents that don't have this skill
    if (options.addNew) {
      for (const agentType of detectedAgents) {
        if (!skillAgents.includes(agentType)) {
          newAgentSkills.push({ skill, agent: agentType });
        }
      }
    }
  }

  s.stop('Scan complete');

  // Report issues
  if (issues.length === 0 && newAgentSkills.length === 0) {
    p.log.success('All installations are in sync');
    p.outro(pc.green('Done'));
    return;
  }

  // Show issues
  if (issues.length > 0) {
    p.log.warn(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
    for (const issue of issues) {
      const agentName = agents[issue.agent]?.displayName || issue.agent;
      const issueType =
        issue.issue === 'missing'
          ? pc.yellow('missing')
          : issue.issue === 'broken'
            ? pc.red('broken')
            : pc.yellow('wrong target');
      console.log(`  · ${issue.skill.name} → ${agentName}: ${issueType}`);
    }
  }

  // Show new agent opportunities
  if (newAgentSkills.length > 0) {
    console.log();
    p.log.info(`${newAgentSkills.length} skill(s) can be added to newly detected agents`);
    const grouped = new Map<string, AgentType[]>();
    for (const { skill, agent } of newAgentSkills) {
      const key = `${skill.owner}/${skill.repo}/${skill.name}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(agent);
    }
    for (const [skillRef, agentTypes] of grouped) {
      const agentNames = agentTypes.map((a) => agents[a]?.displayName || a).join(', ');
      console.log(`  · ${skillRef} → ${pc.dim(agentNames)}`);
    }
  }

  // Fix issues if requested
  if (!options.fix) {
    console.log();
    p.log.info(`Run ${pc.cyan('vett sync --fix')} to repair issues`);
    if (newAgentSkills.length > 0) {
      p.log.info(`Run ${pc.cyan('vett sync --fix --add-new')} to also install to new agents`);
    }
    p.outro(pc.yellow('Sync check complete'));
    return;
  }

  // Fix mode
  console.log();
  s.start('Fixing issues');

  let fixed = 0;
  let failed = 0;

  // Fix existing issues
  for (const issue of issues) {
    const scope = issue.skill.scope || 'global';
    const isGlobal = scope === 'global';

    // Check if canonical path exists (can't fix broken if source is gone)
    if (!existsSync(issue.skill.path)) {
      p.log.warn(`Cannot fix ${issue.skill.name}: canonical path missing`);
      failed++;
      continue;
    }

    const result = await installToAgent(issue.skill.path, issue.skill.name, issue.agent, {
      global: isGlobal,
    });

    if (result.success) {
      fixed++;
    } else {
      p.log.warn(`Failed to fix ${issue.skill.name} → ${issue.agent}: ${result.error}`);
      failed++;
    }
  }

  // Add to new agents
  if (options.addNew) {
    for (const { skill, agent } of newAgentSkills) {
      const scope = skill.scope || 'global';
      const isGlobal = scope === 'global';

      const result = await installToAgent(skill.path, skill.name, agent, { global: isGlobal });

      if (result.success) {
        // Update config to include new agent
        const skillAgents = (skill.agents || []) as AgentType[];
        if (!skillAgents.includes(agent)) {
          skill.agents = [...skillAgents, agent];
        }
        fixed++;
      } else {
        failed++;
      }
    }

    // Save updated config
    saveIndex(index);
  }

  s.stop(`Fixed ${fixed} issue${fixed === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`);

  p.outro(pc.green('Sync complete'));
}
