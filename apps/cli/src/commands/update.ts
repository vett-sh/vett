import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadIndex, getInstalledSkill } from '../config';
import { getSkillByRef } from '../api';
import { UpgradeRequiredError } from '../errors';
import { add } from './add';

export async function update(skillRef?: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett update ')));

  const index = loadIndex();

  if (skillRef) {
    const parts = skillRef.split('/');
    if (parts.length !== 3) {
      p.log.error('Invalid skill reference. Format: owner/repo/skill');
      p.outro(pc.red('Failed'));
      process.exit(1);
    }

    const [owner, repo, name] = parts;
    const installed = getInstalledSkill(owner, repo, name);

    if (!installed) {
      p.log.error(`Skill not installed: ${skillRef}`);
      p.outro(pc.red('Failed'));
      process.exit(1);
    }

    await updateSkill(owner, repo, name, installed.version);
  } else {
    const skills = index.installedSkills;

    if (skills.length === 0) {
      p.log.warn('No skills installed.');
      p.outro(pc.dim('Nothing to update'));
      return;
    }

    const s = p.spinner();
    s.start(`Checking ${skills.length} skill${skills.length === 1 ? '' : 's'} for updates`);

    let updated = 0;
    for (const skill of skills) {
      const didUpdate = await updateSkill(skill.owner, skill.repo, skill.name, skill.version);
      if (didUpdate) updated++;
    }

    s.stop(`Checked ${skills.length} skill${skills.length === 1 ? '' : 's'}`);

    if (updated > 0) {
      p.log.success(`Updated ${updated} skill${updated === 1 ? '' : 's'}`);
    } else {
      p.log.info('All skills are up to date');
    }
  }

  p.outro(pc.dim('Done'));
}

async function updateSkill(
  owner: string,
  repo: string | null,
  name: string,
  currentVersion: string
): Promise<boolean> {
  const ref = repo ? `${owner}/${repo}/${name}` : `${owner}/${name}`;

  try {
    const skill = await getSkillByRef(owner, repo, name);
    if (!skill) {
      p.log.warn(`${ref}: not found in registry`);
      return false;
    }

    const latestVersion = skill.versions[0]?.version;
    if (!latestVersion) {
      p.log.warn(`${ref}: no versions available`);
      return false;
    }

    if (latestVersion === currentVersion) {
      p.log.info(pc.dim(`${ref}: up to date (${currentVersion})`));
      return false;
    }

    p.log.step(`${ref}: ${currentVersion} ${pc.dim('->')} ${latestVersion}`);
    await add(ref, { force: true, yes: true });
    return true;
  } catch (error) {
    if (error instanceof UpgradeRequiredError) throw error;
    p.log.error(`${ref}: failed to update - ${(error as Error).message}`);
    return false;
  }
}
