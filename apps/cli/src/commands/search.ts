import { searchSkills } from '../api.js';

export async function search(query: string): Promise<void> {
  console.log(`Searching for "${query}"...\n`);

  const skills = await searchSkills(query);

  if (skills.length === 0) {
    console.log('No skills found.');
    return;
  }

  for (const skill of skills) {
    console.log(`${skill.owner}/${skill.repo}/${skill.name}`);
    if (skill.description) {
      console.log(`  ${skill.description}`);
    }
    console.log(`  ${skill.installCount.toLocaleString()} installs | ${skill.source}`);
    console.log();
  }

  console.log(`Found ${skills.length} skill(s)`);
}
