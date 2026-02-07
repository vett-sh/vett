import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadIndex } from '../config';
import { agents, type AgentType } from '../agents';

export async function list(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett list ')));

  const index = loadIndex();
  const skills = index.installedSkills;

  if (skills.length === 0) {
    p.log.warn('No skills installed.');
    p.outro(pc.dim(`Install a skill with: ${pc.cyan('vett add <owner/repo/skill>')}`));
    return;
  }

  for (const skill of skills) {
    const date = new Date(skill.installedAt).toLocaleDateString();
    const scope = skill.scope || 'global';

    const skillAgents = (skill.agents || []) as AgentType[];
    const agentNames =
      skillAgents.length > 0
        ? skillAgents.map((a) => agents[a]?.displayName || a).join(', ') +
          ` ${pc.dim(`(${scope})`)}`
        : `${pc.yellow('none')} ${pc.dim('(vett only)')}`;

    const lines: string[] = [];
    lines.push(`${pc.dim('Agents:')} ${agentNames}`);
    lines.push(`${pc.dim('Installed:')} ${date}`);
    lines.push(`${pc.dim('Path:')} ${pc.dim(skill.path)}`);

    const ownerRef = skill.repo ? `${skill.owner}/${skill.repo}` : skill.owner;
    const header = `${pc.bold(skill.name)} ${pc.dim(`${ownerRef}@${skill.version}`)}`;
    p.note(lines.join('\n'), header);
  }

  p.outro(pc.dim(`${skills.length} skill${skills.length === 1 ? '' : 's'} installed`));
}
