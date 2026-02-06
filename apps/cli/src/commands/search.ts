import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { RiskLevel, SkillWithLatestVersion } from '@vett/core';
import { searchSkills } from '../api';
import { add } from './add';

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

function formatInstalls(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}m`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatRisk(risk: RiskLevel | null | undefined): string {
  switch (risk) {
    case 'none':
    case 'low':
      return pc.green('safe');
    case 'medium':
      return pc.yellow('review');
    case 'high':
      return pc.red('caution');
    case 'critical':
      return pc.red(pc.bold('blocked'));
    default:
      return pc.dim('unscanned');
  }
}

function formatSkillNote(skill: SkillWithLatestVersion): string {
  const lines: string[] = [];
  const risk = formatRisk(skill.latestVersion?.risk as RiskLevel | null);
  const installs = formatInstalls(skill.installCount);

  lines.push(`${risk} ${pc.dim('·')} ${installs} installs ${pc.dim('·')} ${skill.source}`);

  if (skill.description) {
    lines.push('');
    lines.push(pc.dim(skill.description));
  }

  return lines.join('\n');
}

export async function search(query: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett search ')));

  const s = p.spinner();
  s.start(`Searching for "${query}"`);

  let skills;
  try {
    skills = await searchSkills(query);
  } catch (error) {
    s.stop('Search failed');
    p.log.error((error as Error).message);
    p.outro(pc.red('Search failed'));
    process.exit(1);
  }

  if (skills.length === 0) {
    s.stop('No results');
    p.log.warn('No skills found matching your query.');
    p.outro(pc.dim('Try a different search term'));
    return;
  }

  s.stop(`Found ${skills.length} skill${skills.length === 1 ? '' : 's'}`);

  // Terminal width is globally capped; use it for description truncation.
  // Reserve space for clack's select chrome (radio + padding ~ 6 chars).
  const labelWidth = (process.stdout.columns || 80) - 6;

  const options = skills.map((skill) => {
    const ref = `${skill.owner}/${skill.repo}/${pc.bold(skill.name)}`;
    const risk = formatRisk(skill.latestVersion?.risk as RiskLevel | null);
    const installs = formatInstalls(skill.installCount);
    const meta = pc.dim(`${installs} · ${skill.source} ·`) + ` ${risk}`;
    const desc = skill.description
      ? `\n    ${pc.dim(truncate(skill.description, labelWidth - 4))}`
      : '';

    return {
      value: `${skill.owner}/${skill.repo}/${skill.name}`,
      label: `${ref}  ${meta}${desc}`,
    };
  });

  // Select → detail → confirm loop. "No" at confirm returns to the list.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const selected = await p.select({
      message: 'Select a skill to install',
      options,
    });

    if (p.isCancel(selected)) {
      p.cancel('Search cancelled');
      return;
    }

    const skill = skills.find((s) => `${s.owner}/${s.repo}/${s.name}` === selected)!;
    p.note(formatSkillNote(skill), selected);

    const confirm = await p.confirm({
      message: `Install ${pc.bold(selected)}?`,
    });

    if (p.isCancel(confirm)) {
      p.cancel('Search cancelled');
      return;
    }

    if (confirm) {
      await add(selected, {});
      return;
    }

    // User said No → loop back to the list
  }
}
