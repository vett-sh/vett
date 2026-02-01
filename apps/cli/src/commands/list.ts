import { loadConfig } from '../config';

const dim = '\x1b[2m';
const reset = '\x1b[0m';

export async function list(): Promise<void> {
  const config = loadConfig();
  const skills = config.installedSkills;

  if (skills.length === 0) {
    console.log('No skills installed.');
    console.log('\nInstall a skill with: vett install <owner/repo/skill>');
    return;
  }

  console.log(`Installed skills (${skills.length}):\n`);

  for (const skill of skills) {
    const date = new Date(skill.installedAt).toLocaleDateString();
    console.log(`${skill.owner}/${skill.repo}/${skill.name}@${skill.version}`);
    console.log(`  ${dim}Installed: ${date}${reset}`);
    console.log(`  ${dim}Path: ${skill.path}${reset}`);
    console.log();
  }
}
