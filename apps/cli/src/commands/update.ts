import { loadConfig, getInstalledSkill } from '../config';
import { getSkillByRef } from '../api';
import { install } from './install';

export async function update(skillRef?: string): Promise<void> {
  const config = loadConfig();

  if (skillRef) {
    // Update specific skill
    const parts = skillRef.split('/');
    if (parts.length !== 3) {
      console.error('Invalid skill reference. Format: owner/repo/skill');
      process.exit(1);
    }

    const [owner, repo, name] = parts;
    const installed = getInstalledSkill(owner, repo, name);

    if (!installed) {
      console.error(`Skill not installed: ${skillRef}`);
      process.exit(1);
    }

    await updateSkill(owner, repo, name, installed.version);
  } else {
    // Update all skills
    const skills = config.installedSkills;

    if (skills.length === 0) {
      console.log('No skills installed.');
      return;
    }

    console.log(`Checking ${skills.length} skill(s) for updates...\n`);

    let updated = 0;
    for (const skill of skills) {
      const didUpdate = await updateSkill(skill.owner, skill.repo, skill.name, skill.version);
      if (didUpdate) updated++;
    }

    console.log(`\nUpdated ${updated} skill(s)`);
  }
}

async function updateSkill(
  owner: string,
  repo: string,
  name: string,
  currentVersion: string
): Promise<boolean> {
  const ref = `${owner}/${repo}/${name}`;

  try {
    const skill = await getSkillByRef(owner, repo, name);
    if (!skill) {
      console.log(`${ref}: not found in registry`);
      return false;
    }

    const latestVersion = skill.versions[0]?.version;
    if (!latestVersion) {
      console.log(`${ref}: no versions available`);
      return false;
    }

    if (latestVersion === currentVersion) {
      console.log(`${ref}: up to date (${currentVersion})`);
      return false;
    }

    console.log(`${ref}: updating ${currentVersion} -> ${latestVersion}`);
    await install(ref, { force: true });
    return true;
  } catch (error) {
    console.error(`${ref}: failed to update - ${(error as Error).message}`);
    return false;
  }
}
