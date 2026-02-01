import { program } from 'commander';
import { add } from './commands/add';
import { install } from './commands/install';
import { search } from './commands/search';
import { info } from './commands/info';
import { list } from './commands/list';
import { update } from './commands/update';

program.name('vett').description('CLI for the Vett secure agent skill registry').version('0.1.0');

program
  .command('add <url>')
  .description('Add a skill from any URL (analyzes, prompts, and installs)')
  .option('-f, --force', 'Force reinstall if already installed')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(add);

program
  .command('install <skill>')
  .description('Install a skill from registry (format: owner/repo/skill[@version])')
  .option('-f, --force', 'Force reinstall if already installed')
  .action(install);

program.command('search <query>').description('Search for skills').action(search);

program.command('info <skill>').description('Show detailed information about a skill').action(info);

program.command('list').description('List installed skills').action(list);

program
  .command('update [skill]')
  .description('Update installed skill(s) to latest version')
  .action(update);

program.parse();
