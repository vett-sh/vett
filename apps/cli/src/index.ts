import { program } from 'commander';
import { add } from './commands/add';
import { search } from './commands/search';
import { info } from './commands/info';
import { list } from './commands/list';
import { update } from './commands/update';
import { remove } from './commands/remove';
import { sync } from './commands/sync';
import { listAgents } from './commands/agents';

declare const __VERSION__: string;

program
  .name('vett')
  .description('CLI for the Vett secure agent skill registry')
  .version(__VERSION__);

// Collect multiple -a flags into an array
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .command('add <input>')
  .description('Add a skill from URL or ref (registry-first, then analyze/install)')
  .option('-f, --force', 'Force reinstall if already installed')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-g, --global', 'Install globally (default)')
  .option('-p, --project', 'Install to current project only')
  .option('-a, --agent <agent>', 'Target specific agent(s)', collect, [])
  .action(add);

program.command('search <query>').description('Search for skills').action(search);

program.command('info <skill>').description('Show detailed information about a skill').action(info);

program.command('list').description('List installed skills').action(list);

program
  .command('update [skill]')
  .description('Update installed skill(s) to latest version')
  .action(update);

program
  .command('remove <skill>')
  .alias('rm')
  .description('Remove an installed skill')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Show what would be removed without deleting')
  .action(remove);

program
  .command('sync')
  .description('Check and repair agent symlinks')
  .option('--fix', 'Repair broken/missing symlinks')
  .option('--add-new', 'Also install to newly detected agents (requires --fix)')
  .action(sync);

program.command('agents').description('List detected AI coding agents').action(listAgents);

program.parse();
