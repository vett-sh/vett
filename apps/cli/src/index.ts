import { program } from 'commander';
import { add } from './commands/add';
import { search } from './commands/search';
import { info } from './commands/info';
import { list } from './commands/list';
import { update } from './commands/update';
import { remove } from './commands/remove';
import { sync } from './commands/sync';
import { listAgents } from './commands/agents';
import { trackCommand, trackError } from './telemetry';
import { capTerminalWidth } from './terminal';

declare const __VERSION__: string;

capTerminalWidth();

program
  .name('vett')
  .description('CLI for the Vett secure agent skill registry')
  .version(__VERSION__);

// Collect multiple -a flags into an array
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withTelemetry(commandName: string, fn: (...args: any[]) => Promise<void>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]): Promise<void> => {
    const start = performance.now();
    let success = true;
    try {
      await fn(...args);
    } catch (err) {
      success = false;
      trackError({ command: commandName, error: err });
      throw err;
    } finally {
      trackCommand({ command: commandName, duration_ms: performance.now() - start, success });
      // Yield to let the fire-and-forget fetch initiate before Node exits
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
}

program
  .command('add <input>')
  .description('Add a skill from URL or ref (registry-first, then analyze/install)')
  .option('-f, --force', 'Force reinstall if already installed')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-g, --global', 'Install globally (default)')
  .option('-p, --project', 'Install to current project only')
  .option('-a, --agent <agent>', 'Target specific agent(s)', collect, [])
  .action(withTelemetry('add', add));

program
  .command('search <query>')
  .description('Search for skills')
  .action(withTelemetry('search', search));

program
  .command('info <skill>')
  .description('Show detailed information about a skill')
  .action(withTelemetry('info', info));

program.command('list').description('List installed skills').action(withTelemetry('list', list));

program
  .command('update [skill]')
  .description('Update installed skill(s) to latest version')
  .action(withTelemetry('update', update));

program
  .command('remove <skill>')
  .alias('rm')
  .description('Remove an installed skill')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Show what would be removed without deleting')
  .action(withTelemetry('remove', remove));

program
  .command('sync')
  .description('Check and repair agent symlinks')
  .option('--fix', 'Repair broken/missing symlinks')
  .option('--add-new', 'Also install to newly detected agents (requires --fix)')
  .action(withTelemetry('sync', sync));

program
  .command('agents')
  .description('List detected AI coding agents')
  .action(withTelemetry('agents', listAgents));

program.parse();
