import { program } from 'commander';
import { add } from './commands/add';
import { search } from './commands/search';
import { info } from './commands/info';
import { list } from './commands/list';
import { update } from './commands/update';

program.name('vett').description('CLI for the Vett secure agent skill registry').version('0.1.0');

program
  .command('add <input>')
  .description('Add a skill from URL or ref (registry-first, then analyze/install)')
  .option('-f, --force', 'Force reinstall if already installed')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--no-verify', 'Skip signature verification')
  .action(add);

program.command('search <query>').description('Search for skills').action(search);

program.command('info <skill>').description('Show detailed information about a skill').action(info);

program.command('list').description('List installed skills').action(list);

program
  .command('update [skill]')
  .description('Update installed skill(s) to latest version')
  .action(update);

program.parse();
