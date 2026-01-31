#!/usr/bin/env node
import { program } from 'commander';
import { install } from './commands/install.js';
import { search } from './commands/search.js';
import { info } from './commands/info.js';
import { list } from './commands/list.js';
import { update } from './commands/update.js';

program
  .name('vett')
  .description('CLI for the Vett secure agent skill registry')
  .version('0.1.0');

program
  .command('install <skill>')
  .description('Install a skill (format: owner/repo/skill[@version])')
  .option('-f, --force', 'Force reinstall if already installed')
  .action(install);

program
  .command('search <query>')
  .description('Search for skills')
  .action(search);

program
  .command('info <skill>')
  .description('Show detailed information about a skill')
  .action(info);

program
  .command('list')
  .description('List installed skills')
  .action(list);

program
  .command('update [skill]')
  .description('Update installed skill(s) to latest version')
  .action(update);

program.parse();
