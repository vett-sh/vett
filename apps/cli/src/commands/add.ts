import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { ingestSkill, waitForJob, downloadArtifact, type JobResponse } from '../api';
import { getSkillDir, addInstalledSkill, getInstalledSkill } from '../config';
import type { AnalysisResult, RiskLevel } from '@vett/core';

interface SkillManifest {
  entryPoint: string;
  files: Array<{ path: string; content: string; contentType?: string }>;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get verdict from risk level
 */
function getVerdict(risk: RiskLevel | null): 'verified' | 'review' | 'blocked' {
  if (!risk || risk === 'none' || risk === 'low') return 'verified';
  if (risk === 'medium') return 'review';
  return 'blocked';
}

/**
 * Format the skill info for display
 */
function formatSkillInfo(job: JobResponse): string {
  const result = job.result!;
  const version = result.version;
  const analysis = version.analysis;
  const verdict = getVerdict(version.risk as RiskLevel);

  const lines: string[] = [];

  // Header
  const verdictIcon =
    verdict === 'verified' ? pc.green('✓') : verdict === 'review' ? pc.yellow('⚠') : pc.red('⛔');
  const verdictLabel =
    verdict === 'verified'
      ? pc.green('Verified')
      : verdict === 'review'
        ? pc.yellow('Review')
        : pc.red('Blocked');

  lines.push(`${pc.bold(result.skill.name)}`);
  lines.push(
    `${verdictIcon} ${verdictLabel} ${pc.dim('·')} ${pc.dim(`${result.skill.owner}/${result.skill.repo}`)}`
  );

  // Show summary or description
  const summary = version.summary || result.skill.description;
  if (summary) {
    lines.push('');
    lines.push(pc.dim(summary));
  }

  lines.push('');

  // Permissions
  lines.push(pc.bold('Permissions'));
  if (analysis) {
    const fs = analysis.permissions.filesystem;
    const net = analysis.permissions.network;
    const env = analysis.permissions.env;

    lines.push(`  ${pc.dim('Filesystem:')} ${fs.length > 0 ? fs.join(', ') : pc.dim('none')}`);
    lines.push(
      `  ${pc.dim('Network:')}    ${net.length > 0 ? net.slice(0, 2).join(', ') + (net.length > 2 ? ` +${net.length - 2} more` : '') : pc.dim('none')}`
    );
    lines.push(`  ${pc.dim('Env vars:')}   ${env.length > 0 ? env.join(', ') : pc.dim('none')}`);
  } else {
    lines.push(`  ${pc.dim('(no analysis available)')}`);
  }

  // Security findings (sorted by severity)
  if (analysis && analysis.flags.length > 0) {
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortedFlags = [...analysis.flags].sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );

    lines.push('');
    lines.push(pc.bold('Security Findings'));
    for (const flag of sortedFlags.slice(0, 4)) {
      const isCriticalOrHigh = flag.severity === 'critical' || flag.severity === 'high';
      const severityColor = isCriticalOrHigh
        ? pc.red
        : flag.severity === 'medium'
          ? pc.yellow
          : pc.dim;
      const icon = isCriticalOrHigh ? '!' : '·';
      lines.push(`  ${severityColor(`${icon} [${flag.severity.toUpperCase()}]`)} ${flag.type}`);
    }
    if (sortedFlags.length > 4) {
      lines.push(`  ${pc.dim(`... and ${sortedFlags.length - 4} more`)}`);
    }
  }

  // Metadata
  lines.push('');
  lines.push(
    `${pc.dim('Size:')} ${formatBytes(version.size)}  ${pc.dim('Version:')} ${version.version}`
  );

  return lines.join('\n');
}

/**
 * Install skill files from manifest
 */
function installSkillFiles(manifest: SkillManifest, skillDir: string): void {
  mkdirSync(skillDir, { recursive: true });

  for (const file of manifest.files) {
    const filePath = join(skillDir, file.path);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, file.content, 'utf-8');
  }
}

export async function add(url: string, options: { force?: boolean; yes?: boolean }): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett add ')));

  const s = p.spinner();

  // Submit for ingestion
  s.start('Submitting for analysis');
  let ingestResponse;
  try {
    ingestResponse = await ingestSkill(url);
  } catch (error) {
    s.stop('Submission failed');
    p.log.error((error as Error).message);
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }
  s.stop('Submitted');

  // Poll for completion
  s.start('Analyzing skill');
  let job: JobResponse;
  try {
    job = await waitForJob(ingestResponse.jobId, {
      onProgress: (status) => {
        if (status === 'processing') {
          s.message('Analyzing skill');
        }
      },
    });
  } catch (error) {
    s.stop('Analysis failed');
    p.log.error((error as Error).message);
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }

  // Handle failure
  if (job.status === 'failed') {
    s.stop('Analysis failed');
    p.log.error(job.error || 'Unknown error');
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }

  s.stop('Analysis complete');

  const result = job.result!;
  const verdict = getVerdict(result.version.risk as RiskLevel);

  // Display skill info
  const skillRef = `${result.skill.owner}/${result.skill.repo}/${result.skill.name}`;
  p.note(formatSkillInfo(job), skillRef);

  // Block high-risk skills
  if (verdict === 'blocked') {
    p.log.error('Potential malicious behavior detected');
    p.outro(pc.red('Installation refused'));
    process.exit(1);
  }

  // Auto-approve or prompt
  let shouldInstall = options.yes;
  if (!shouldInstall) {
    const confirmResult = await p.confirm({
      message: 'Install this skill?',
      initialValue: verdict === 'verified',
    });

    if (p.isCancel(confirmResult)) {
      p.cancel('Installation cancelled');
      process.exit(0);
    }

    shouldInstall = confirmResult;
  }

  if (!shouldInstall) {
    p.cancel('Installation cancelled');
    return;
  }

  // Check if already installed
  const existing = getInstalledSkill(result.skill.owner, result.skill.repo, result.skill.name);
  if (existing && !options.force) {
    const replaceResult = await p.confirm({
      message: `Already installed (${existing.version}). Replace?`,
      initialValue: false,
    });

    if (p.isCancel(replaceResult) || !replaceResult) {
      p.cancel('Installation cancelled');
      return;
    }
  }

  // Download and verify
  s.start('Downloading and verifying');
  let manifestContent: ArrayBuffer;
  try {
    manifestContent = await downloadArtifact(result.version.artifactUrl, result.version.hash);
  } catch (error) {
    s.stop('Download failed');
    p.log.error((error as Error).message);
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }
  s.stop('Downloaded and verified');

  // Parse manifest and install files
  s.start('Installing');
  const manifest = JSON.parse(Buffer.from(manifestContent).toString('utf-8')) as SkillManifest;
  const skillDir = getSkillDir(result.skill.owner, result.skill.repo, result.skill.name);
  installSkillFiles(manifest, skillDir);

  // Update config
  addInstalledSkill({
    owner: result.skill.owner,
    repo: result.skill.repo,
    name: result.skill.name,
    version: result.version.version,
    installedAt: new Date(),
    path: skillDir,
  });
  s.stop('Installed');

  p.log.success(
    `${result.skill.owner}/${result.skill.repo}/${result.skill.name}@${result.version.version}`
  );
  p.log.info(`Location: ${pc.dim(skillDir)}`);

  p.outro(pc.green('Done'));
}
