import * as p from '@clack/prompts';
import pc from 'picocolors';
import { agents, getAgentTypes, detectInstalledAgents } from '../agents';

/**
 * List all known agents and their detection status.
 */
export async function listAgents(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett agents ')));

  const s = p.spinner();
  s.start('Detecting installed agents');

  const installedAgents = await detectInstalledAgents();
  const installedSet = new Set(installedAgents);

  s.stop('Detection complete');

  const allAgents = getAgentTypes();

  // Group by installed status
  const installed = allAgents.filter((a) => installedSet.has(a));
  const notInstalled = allAgents.filter((a) => !installedSet.has(a));

  // Display installed agents
  if (installed.length > 0) {
    p.log.success(`Detected ${installed.length} agent${installed.length === 1 ? '' : 's'}:`);
    for (const agentType of installed) {
      const agent = agents[agentType];
      const globalPath = agent.globalSkillsDir || '(project-only)';
      console.log(`  ${pc.green('✓')} ${pc.bold(agent.displayName)}`);
      console.log(`    ${pc.dim(globalPath)}`);
    }
  } else {
    p.log.warn('No supported agents detected');
  }

  // Display not installed agents (collapsed)
  if (notInstalled.length > 0) {
    console.log('');
    p.log.info(pc.dim(`${notInstalled.length} other supported agents not detected`));

    // Show first few as examples
    const examples = notInstalled.slice(0, 5);
    for (const agentType of examples) {
      const agent = agents[agentType];
      console.log(`  ${pc.dim('·')} ${pc.dim(agent.displayName)}`);
    }
    if (notInstalled.length > 5) {
      console.log(`  ${pc.dim(`... and ${notInstalled.length - 5} more`)}`);
    }
  }

  p.outro(pc.dim(`Use ${pc.cyan('vett add <skill> -a <agent>')} to target specific agents`));
}
