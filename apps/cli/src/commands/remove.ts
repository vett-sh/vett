import { rm } from 'node:fs/promises';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig, removeInstalledSkill } from '../config';
import { agents, type AgentType } from '../agents';
import { removeFromAgent, isPathSafe } from '../installer';
import type { InstalledSkill } from '@vett/core';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Dangerous patterns that should never be accepted as skill refs
const DANGEROUS_PATTERNS = /^[.~*\/\\]$|^\.\.|\.\.|[*?<>|]|^\/|\\|\x00/;

export interface ParsedRef {
  owner?: string;
  repo?: string;
  name: string;
}

/**
 * Parse a skill reference string into components.
 * Returns null if the reference is invalid or potentially dangerous.
 */
export function parseSkillRef(ref: string): ParsedRef | null {
  const trimmed = ref.trim();

  // Reject empty
  if (!trimmed) return null;

  // Reject dangerous patterns
  if (DANGEROUS_PATTERNS.test(trimmed)) return null;

  const parts = trimmed.split('/');

  // owner/repo/name
  if (parts.length === 3) {
    const [owner, repo, name] = parts;
    if (!owner || !repo || !name) return null;
    if (DANGEROUS_PATTERNS.test(owner)) return null;
    if (DANGEROUS_PATTERNS.test(repo)) return null;
    if (DANGEROUS_PATTERNS.test(name)) return null;
    return { owner, repo, name };
  }

  // name only
  if (parts.length === 1) {
    const name = parts[0];
    if (!name || DANGEROUS_PATTERNS.test(name)) return null;
    return { name };
  }

  // Invalid format (2 parts or 4+ parts)
  return null;
}

export type FindResult =
  | { status: 'found'; skill: InstalledSkill }
  | { status: 'not_found' }
  | { status: 'ambiguous'; matches: InstalledSkill[] };

/**
 * Find a skill by reference.
 * O(n) where n = number of installed skills. Fine for typical use (< 100 skills).
 */
export function findSkillByRef(skills: InstalledSkill[], ref: ParsedRef): FindResult {
  // Full reference - exact match
  if (ref.owner && ref.repo) {
    const skill = skills.find(
      (s) => s.owner === ref.owner && s.repo === ref.repo && s.name === ref.name
    );
    return skill ? { status: 'found', skill } : { status: 'not_found' };
  }

  // Name-only - search for matches (case-insensitive)
  const nameLower = ref.name.toLowerCase();
  const matches = skills.filter((s) => s.name.toLowerCase() === nameLower);

  if (matches.length === 0) {
    return { status: 'not_found' };
  }

  if (matches.length === 1) {
    return { status: 'found', skill: matches[0] };
  }

  return { status: 'ambiguous', matches };
}

/**
 * Validate that a path is safe to delete.
 * Must be within ~/.vett/skills/ and not a system path.
 */
function isSafeToDelete(path: string): boolean {
  const vettSkillsDir = join(homedir(), '.vett', 'skills');

  // Must be within vett's skills directory
  if (!isPathSafe(vettSkillsDir, path)) {
    return false;
  }

  // Must not be the skills directory itself
  if (path === vettSkillsDir) {
    return false;
  }

  // Must have depth (owner/repo/name structure)
  const relative = path.slice(vettSkillsDir.length + 1);
  const depth = relative.split('/').filter(Boolean).length;
  if (depth < 1) {
    return false;
  }

  return true;
}

/**
 * Remove an installed skill.
 *
 * Removes from vett's canonical location and all agent symlinks/copies.
 */
export async function remove(
  skillRef: string,
  options: { yes?: boolean; dryRun?: boolean }
): Promise<void> {
  p.intro(pc.bgRed(pc.white(' vett remove ')));

  // Parse and validate reference
  const parsed = parseSkillRef(skillRef);
  if (!parsed) {
    p.log.error('Invalid skill reference');
    p.log.info(pc.dim('Use: owner/repo/name or skill-name'));
    p.log.info(pc.dim('Example: vett remove acme/tools/commit'));
    p.outro(pc.red('Removal failed'));
    process.exit(1);
  }

  // Find the skill
  const config = loadConfig();
  const result = findSkillByRef(config.installedSkills, parsed);

  if (result.status === 'not_found') {
    p.log.error(`Skill "${skillRef}" not found`);
    p.log.info(pc.dim('Use "vett list" to see installed skills'));
    p.outro(pc.red('Removal failed'));
    process.exit(1);
  }

  if (result.status === 'ambiguous') {
    p.log.error(`Multiple skills match "${skillRef}":`);
    for (const m of result.matches) {
      console.log(`  · ${m.owner}/${m.repo}/${m.name}`);
    }
    p.log.info('Specify the full reference: owner/repo/name');
    p.outro(pc.red('Removal failed'));
    process.exit(1);
  }

  const skill = result.skill;
  const fullRef = `${skill.owner}/${skill.repo}/${skill.name}`;

  // Validate path safety
  if (!isSafeToDelete(skill.path)) {
    p.log.error('Refusing to delete: path safety check failed');
    p.log.info(pc.dim(`Path: ${skill.path}`));
    p.outro(pc.red('Removal failed'));
    process.exit(1);
  }

  // Show what will be removed
  p.log.info(`Skill: ${pc.bold(fullRef)}`);
  p.log.info(`Path: ${pc.dim(skill.path)}`);

  const installedAgents = (skill.agents || []) as AgentType[];
  if (installedAgents.length > 0) {
    const agentNames = installedAgents.map((a) => agents[a]?.displayName || a).join(', ');
    p.log.info(`Agents: ${pc.dim(agentNames)}`);
  }

  // Dry run stops here
  if (options.dryRun) {
    p.log.warn('Dry run - no changes made');
    p.outro(pc.yellow('Dry run complete'));
    return;
  }

  // Confirm removal
  if (!options.yes) {
    const confirm = await p.confirm({
      message: `Remove ${pc.bold(fullRef)}?`,
      initialValue: false,
    });

    if (p.isCancel(confirm) || !confirm) {
      p.cancel('Removal cancelled');
      return;
    }
  }

  const s = p.spinner();

  // Remove from agent locations
  const scope = skill.scope || 'global';
  const isGlobal = scope === 'global';

  if (installedAgents.length > 0) {
    s.start('Removing from agents');

    const results = await Promise.all(
      installedAgents.map((agent) => removeFromAgent(skill.name, agent, { global: isGlobal }))
    );

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      s.stop('Some agent removals failed');
      for (const f of failed) {
        p.log.warn(f.error || 'Unknown error');
      }
    } else {
      const agentNames = installedAgents.map((a) => agents[a]?.displayName || a);
      s.stop(`Removed from ${agentNames.join(', ')}`);
    }
  }

  // Remove canonical location
  s.start('Removing from vett');
  try {
    await rm(skill.path, { recursive: true, force: true });
    s.stop('Removed from vett');
  } catch (error) {
    s.stop('Failed to remove canonical location');
    p.log.warn((error as Error).message);
  }

  // Update config
  removeInstalledSkill(skill.owner, skill.repo, skill.name);

  p.log.success(`Removed ${fullRef}`);
  p.outro(pc.green('Done'));
}
