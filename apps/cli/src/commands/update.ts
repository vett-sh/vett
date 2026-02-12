import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadIndex, getInstalledSkillBySlug, backfillSlug } from '../config';
import { getSkillDetail } from '../api';
import { UpgradeRequiredError } from '../errors';
import { add } from './add';

export async function update(skillRef?: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett update ')));

  const index = loadIndex();

  if (skillRef) {
    // Accept slug or name — match against stored slug or name
    const installed = index.installedSkills.find((s) => s.slug === skillRef || s.name === skillRef);

    if (!installed) {
      p.log.error(`Skill not installed: ${skillRef}`);
      p.outro(pc.red('Failed'));
      process.exit(1);
    }

    const slug = installed.slug ?? backfillSlug(installed);
    await updateSkill(slug, installed.version);
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
      const slug = skill.slug ?? backfillSlug(skill);
      const didUpdate = await updateSkill(slug, skill.version);
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

async function updateSkill(slug: string, currentVersion: string): Promise<boolean> {
  try {
    const skill = await getSkillDetail(slug);
    if (!skill) {
      p.log.warn(`${slug}: not found in registry`);
      return false;
    }

    const latestVersion = skill.versions[0]?.version;
    if (!latestVersion) {
      p.log.warn(`${slug}: no versions available`);
      return false;
    }

    if (latestVersion === currentVersion) {
      p.log.info(pc.dim(`${slug}: up to date (${currentVersion})`));
      return false;
    }

    p.log.step(`${slug}: ${currentVersion} ${pc.dim('->')} ${latestVersion}`);
    await add(slug, { force: true, yes: true });
    return true;
  } catch (error) {
    if (error instanceof UpgradeRequiredError) throw error;
    p.log.error(`${slug}: failed to update - ${(error as Error).message}`);
    return false;
  }
}
