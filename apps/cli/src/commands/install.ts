import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSkillByRef, downloadSkill } from '../api';
import { getSkillPath, addInstalledSkill, getInstalledSkill } from '../config';
import { skillRefSchema } from '@vett/core';

function parseSkillRef(ref: string): {
  owner: string;
  repo: string;
  name: string;
  version?: string;
} {
  // Parse owner/repo/skill[@version]
  const atIndex = ref.lastIndexOf('@');
  let skillPath: string;
  let version: string | undefined;

  if (atIndex > 0) {
    skillPath = ref.slice(0, atIndex);
    version = ref.slice(atIndex + 1);
  } else {
    skillPath = ref;
  }

  const parts = skillPath.split('/');
  if (parts.length !== 3) {
    throw new Error('Invalid skill reference. Format: owner/repo/skill[@version]');
  }

  return {
    owner: parts[0],
    repo: parts[1],
    name: parts[2],
    version,
  };
}

export async function install(skillRef: string, options: { force?: boolean }): Promise<void> {
  console.log(`Installing ${skillRef}...`);

  // Parse the skill reference
  let parsed;
  try {
    parsed = parseSkillRef(skillRef);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }

  const { owner, repo, name, version } = parsed;

  // Check if already installed
  const existing = getInstalledSkill(owner, repo, name);
  if (existing && !options.force) {
    console.log(`Skill ${owner}/${repo}/${name} is already installed (${existing.version})`);
    console.log('Use --force to reinstall');
    return;
  }

  // Fetch skill info
  console.log('Fetching skill info...');
  const skill = await getSkillByRef(owner, repo, name);
  if (!skill) {
    console.error(`Skill not found: ${owner}/${repo}/${name}`);
    process.exit(1);
  }

  // Determine version to install
  const targetVersion = version || (skill.versions[0]?.version ?? 'latest');
  console.log(`Version: ${targetVersion}`);

  // Download the skill
  console.log('Downloading...');
  const { content } = await downloadSkill(skill.id, targetVersion);

  // Write to disk
  const skillPath = getSkillPath(owner, repo, name);
  mkdirSync(dirname(skillPath), { recursive: true });
  writeFileSync(skillPath, Buffer.from(content));

  // Update config
  addInstalledSkill({
    owner,
    repo,
    name,
    version: targetVersion,
    installedAt: new Date(),
    path: skillPath,
  });

  console.log(`Installed ${owner}/${repo}/${name}@${targetVersion}`);
  console.log(`Location: ${skillPath}`);
}
