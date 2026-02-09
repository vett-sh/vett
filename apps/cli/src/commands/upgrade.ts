import * as p from '@clack/prompts';
import pc from 'picocolors';
import semver from 'semver';
import { checkForUpdates, getCachedUpdateInfo } from '../update-notifier';

declare const __VERSION__: string;

export async function upgrade(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett upgrade ')));

  const spinner = p.spinner();
  spinner.start('Checking latest version');
  const checked = await checkForUpdates().catch(() => null);
  spinner.stop('Ready');

  const fallback = getCachedUpdateInfo();
  const latest = checked?.latest ?? fallback?.latest ?? null;
  const checkedAtMs = checked?.checkedAtMs ?? fallback?.checkedAtMs ?? null;
  const latestLabel = (() => {
    if (!latest || !checkedAtMs) return pc.dim('unknown (offline or registry unreachable)');
    const updateAvailable = semver.valid(__VERSION__) && semver.gt(latest, __VERSION__);
    const checkedAt = new Date(checkedAtMs).toLocaleString();
    const suffix = updateAvailable
      ? ` ${pc.yellow('(update available)')}`
      : pc.dim(' (up to date)');
    const source = checked?.source === 'cache' ? pc.dim('cached') : pc.dim('checked');
    return `${pc.cyan(latest)} ${pc.dim(`(${source} ${checkedAt})`)}${suffix}`;
  })();

  const lines: string[] = [];
  lines.push(`${pc.dim('Current:')} ${pc.bold(__VERSION__)}`);
  lines.push(`${pc.dim('Latest:')} ${latestLabel}`);
  lines.push('');
  lines.push(`${pc.bold('Global install')}`);
  lines.push(`  ${pc.cyan('pnpm add -g vett@latest')}`);
  lines.push(`  ${pc.dim('or')}`);
  lines.push(`  ${pc.cyan('npm i -g vett@latest')}`);
  lines.push('');
  lines.push(`${pc.bold('npx (recommended for one-offs)')}`);
  lines.push(`  ${pc.cyan('npx -y vett@latest <command>')}`);

  p.note(lines.join('\n'), 'Upgrade vett');
  p.outro(pc.dim('Done'));
}
