import pc from 'picocolors';
import { loadConfig } from '../config';
import { agents, type AgentType } from '../agents';

export async function list(): Promise<void> {
  const config = loadConfig();
  const skills = config.installedSkills;

  if (skills.length === 0) {
    console.log('No skills installed.');
    console.log(`\nInstall a skill with: ${pc.cyan('vett add <owner/repo/skill>')}`);
    return;
  }

  console.log(`Installed skills (${skills.length}):\n`);

  for (const skill of skills) {
    const date = new Date(skill.installedAt).toLocaleDateString();
    const scope = skill.scope || 'global';

    // Skill header
    console.log(
      `${pc.bold(skill.name)} ${pc.dim(`${skill.owner}/${skill.repo}@${skill.version}`)}`
    );

    // Agents
    const skillAgents = (skill.agents || []) as AgentType[];
    if (skillAgents.length > 0) {
      const agentNames = skillAgents.map((a) => agents[a]?.displayName || a).join(', ');
      console.log(`  ${pc.dim('Agents:')} ${agentNames} ${pc.dim(`(${scope})`)}`);
    } else {
      console.log(`  ${pc.dim('Agents:')} ${pc.yellow('none')} ${pc.dim('(vett only)')}`);
    }

    // Metadata
    console.log(`  ${pc.dim('Installed:')} ${date}`);
    console.log(`  ${pc.dim('Path:')} ${pc.dim(skill.path)}`);
    console.log();
  }
}
