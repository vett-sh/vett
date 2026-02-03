/**
 * Skill installation to agent locations
 *
 * Installs skills to agent-specific directories via symlinks (with copy fallback).
 * Vett maintains canonical storage at ~/.vett/skills/; agents get symlinks pointing there.
 *
 * Adapted from vercel-labs/skills (MIT License)
 */

import { symlink, mkdir, rm, cp, lstat, readlink } from 'node:fs/promises';
import { join, relative, dirname, normalize, resolve, sep } from 'node:path';
import { platform } from 'node:os';
import type { AgentType, AgentConfig } from './agents';
import { agents } from './agents';

export type InstallMode = 'symlink' | 'copy';

export interface InstallResult {
  agent: AgentType;
  agentDisplayName: string;
  path: string;
  mode: InstallMode;
  success: boolean;
  error?: string;
}

/**
 * Sanitizes a skill name for use as a directory name.
 * Prevents path traversal attacks and ensures filesystem compatibility.
 */
export function sanitizeName(name: string): string {
  const sanitized = name
    .toLowerCase()
    // Replace any non-alphanumeric (except . and _) with hyphens
    .replace(/[^a-z0-9._]+/g, '-')
    // Remove leading/trailing dots and hyphens
    .replace(/^[.\-]+|[.\-]+$/g, '');

  // Limit to 255 chars (common filesystem limit), fallback if empty
  return sanitized.substring(0, 255) || 'unnamed-skill';
}

/**
 * Validates that a path is within an expected base directory.
 * Prevents path traversal attacks.
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(targetPath));

  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

/**
 * Creates a symlink, handling cross-platform differences.
 * Returns true if symlink was created, false if fallback to copy is needed.
 */
async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = resolve(target);
    const resolvedLinkPath = resolve(linkPath);

    // Don't create self-referential symlinks
    if (resolvedTarget === resolvedLinkPath) {
      return true;
    }

    // Check if symlink already exists and points to correct target
    try {
      const stats = await lstat(linkPath);
      if (stats.isSymbolicLink()) {
        const existingTarget = await readlink(linkPath);
        const resolvedExisting = resolve(dirname(linkPath), existingTarget);
        if (resolvedExisting === resolvedTarget) {
          return true; // Already correctly linked
        }
        await rm(linkPath);
      } else {
        await rm(linkPath, { recursive: true });
      }
    } catch (err: unknown) {
      // ELOOP = circular symlink, ENOENT = doesn't exist
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ELOOP') {
        try {
          await rm(linkPath, { force: true });
        } catch {
          // If we can't remove it, symlink creation will fail
        }
      }
      // For ENOENT or other errors, continue to symlink creation
    }

    // Ensure parent directory exists
    const linkDir = dirname(linkPath);
    await mkdir(linkDir, { recursive: true });

    // Use relative path for the symlink (more portable)
    const relativePath = relative(linkDir, target);

    // On Windows, use junction for directories (doesn't require admin)
    const symlinkType = platform() === 'win32' ? 'junction' : undefined;

    await symlink(relativePath, linkPath, symlinkType);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path where a skill would be installed for a specific agent.
 * Returns null if the agent doesn't support the requested scope.
 */
export function getAgentSkillPath(
  skillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
): { agentBase: string; skillDir: string } | null {
  const agent = agents[agentType];
  const isGlobal = options.global ?? true;
  const cwd = options.cwd || process.cwd();

  // Check if agent supports the requested scope
  if (isGlobal && !agent.globalSkillsDir) {
    return null;
  }

  const agentBase = isGlobal ? agent.globalSkillsDir! : join(cwd, agent.skillsDir);
  const sanitizedName = sanitizeName(skillName);
  const skillDir = join(agentBase, sanitizedName);

  return { agentBase, skillDir };
}

export type SymlinkStatus = 'ok' | 'missing' | 'broken' | 'wrong_target' | 'copy';

/**
 * Check the status of a symlink at a given path.
 */
export async function checkSymlinkStatus(
  linkPath: string,
  expectedTarget: string
): Promise<SymlinkStatus> {
  try {
    const stats = await lstat(linkPath);

    if (!stats.isSymbolicLink()) {
      // It's a real directory (copy mode) - that's fine
      return 'copy';
    }

    const target = await readlink(linkPath);
    const resolvedTarget = resolve(dirname(linkPath), target);
    const resolvedExpected = resolve(expectedTarget);

    if (resolvedTarget !== resolvedExpected) {
      return 'wrong_target';
    }

    // Check if target exists
    const { existsSync } = await import('node:fs');
    if (!existsSync(resolvedTarget)) {
      return 'broken';
    }

    return 'ok';
  } catch {
    return 'missing';
  }
}

/**
 * Install a skill to an agent's skills directory.
 *
 * Creates a symlink from the agent's skills directory to vett's canonical location.
 * Falls back to copying if symlinks fail (e.g., Windows without admin).
 *
 * @param canonicalPath - Vett's canonical skill location (e.g., ~/.vett/skills/owner/repo/name)
 * @param skillName - Display name for the skill (used for directory name)
 * @param agentType - Target agent
 * @param options - Installation options
 */
export async function installToAgent(
  canonicalPath: string,
  skillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
): Promise<InstallResult> {
  const agent: AgentConfig = agents[agentType];
  const isGlobal = options.global ?? true;
  const cwd = options.cwd || process.cwd();

  // Check if agent supports the requested scope
  if (isGlobal && !agent.globalSkillsDir) {
    return {
      agent: agentType,
      agentDisplayName: agent.displayName,
      path: '',
      mode: 'symlink',
      success: false,
      error: `${agent.displayName} does not support global skill installation`,
    };
  }

  // Determine agent's skills directory
  const agentBase = isGlobal ? agent.globalSkillsDir! : join(cwd, agent.skillsDir);
  const sanitizedName = sanitizeName(skillName);
  const agentSkillDir = join(agentBase, sanitizedName);

  // Validate path safety
  if (!isPathSafe(agentBase, agentSkillDir)) {
    return {
      agent: agentType,
      agentDisplayName: agent.displayName,
      path: agentSkillDir,
      mode: 'symlink',
      success: false,
      error: 'Invalid skill name: potential path traversal detected',
    };
  }

  try {
    // Ensure agent's skills directory exists
    await mkdir(agentBase, { recursive: true });

    // Try symlink first
    const symlinkCreated = await createSymlink(canonicalPath, agentSkillDir);

    if (symlinkCreated) {
      return {
        agent: agentType,
        agentDisplayName: agent.displayName,
        path: agentSkillDir,
        mode: 'symlink',
        success: true,
      };
    }

    // Fallback: remove any existing and copy
    await rm(agentSkillDir, { recursive: true, force: true });
    await cp(canonicalPath, agentSkillDir, { recursive: true });

    return {
      agent: agentType,
      agentDisplayName: agent.displayName,
      path: agentSkillDir,
      mode: 'copy',
      success: true,
    };
  } catch (error) {
    return {
      agent: agentType,
      agentDisplayName: agent.displayName,
      path: agentSkillDir,
      mode: 'symlink',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Remove a skill from an agent's skills directory.
 */
export async function removeFromAgent(
  skillName: string,
  agentType: AgentType,
  options: { global?: boolean; cwd?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  const agent = agents[agentType];
  const isGlobal = options.global ?? true;
  const cwd = options.cwd || process.cwd();

  if (isGlobal && !agent.globalSkillsDir) {
    return { success: true }; // Nothing to remove
  }

  const agentBase = isGlobal ? agent.globalSkillsDir! : join(cwd, agent.skillsDir);
  const sanitizedName = sanitizeName(skillName);
  const agentSkillDir = join(agentBase, sanitizedName);

  if (!isPathSafe(agentBase, agentSkillDir)) {
    return { success: false, error: 'Invalid skill name' };
  }

  try {
    await rm(agentSkillDir, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Install a skill to multiple agents.
 */
export async function installToAgents(
  canonicalPath: string,
  skillName: string,
  agentTypes: AgentType[],
  options: { global?: boolean; cwd?: string } = {}
): Promise<InstallResult[]> {
  const results = await Promise.all(
    agentTypes.map((agent) => installToAgent(canonicalPath, skillName, agent, options))
  );
  return results;
}
