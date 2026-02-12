import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, normalize, sep } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolveSkill, waitForJob, downloadArtifact, getSkillDetail, RateLimitError } from '../api';
import { getSkillDir, addInstalledSkill, getInstalledSkillBySlug } from '../config';
import { verifyManifestOrThrow } from '../signatures';
import { createSkillManifestSchema } from '@vett/core';
import type { AnalysisResult, RiskLevel, SkillManifest } from '@vett/core';
import type { ApiSkillDetail, ApiSkillVersion } from '../lib/api-types';
import { detectInstalledAgents, parseAgentTypes, agents, type AgentType } from '../agents';
import { installToAgents } from '../installer';
import { assertNoSymlinkPathComponents } from '../lib/fs-safety';
import { UpgradeRequiredError } from '../errors';

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
function getVerdict(risk: RiskLevel | null): 'verified' | 'review' | 'caution' | 'blocked' {
  if (!risk || risk === 'none' || risk === 'low') return 'verified';
  if (risk === 'medium') return 'review';
  if (risk === 'high') return 'caution';
  return 'blocked';
}

/**
 * Format the skill info for display
 */
interface VersionInfo {
  version: string;
  hash: string;
  size: number;
  risk: RiskLevel | null;
  summary: string | null;
  analysis: AnalysisResult | null;
  sigstoreBundle: unknown | null;
}

interface SkillInfo {
  slug: string;
  owner: string;
  repo: string | null;
  name: string;
  description: string | null;
}

interface ResolvedResult {
  skill: SkillInfo;
  version: VersionInfo;
}

function formatSkillInfo(result: ResolvedResult): string {
  const { skill, version } = result;
  const analysis = version.analysis;
  const verdict = getVerdict(version.risk as RiskLevel);

  const lines: string[] = [];

  // Header
  const verdictIcon =
    verdict === 'verified'
      ? pc.green('✓')
      : verdict === 'review'
        ? pc.yellow('⚠')
        : verdict === 'caution'
          ? pc.red('⚠')
          : pc.red('⛔');
  const verdictLabel =
    verdict === 'verified'
      ? pc.green('Verified')
      : verdict === 'review'
        ? pc.yellow('Review')
        : verdict === 'caution'
          ? pc.red('Caution')
          : pc.red('Blocked');

  lines.push(`${pc.bold(skill.name)}`);
  lines.push(
    `${verdictIcon} ${verdictLabel} ${pc.dim('·')} ${pc.dim(skill.repo ? `${skill.owner}/${skill.repo}` : skill.owner)}`
  );

  // Show summary or description
  const summary = version.summary || skill.description;
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
 * Error thrown when a path traversal attempt is detected
 */
class PathTraversalError extends Error {
  constructor(
    public readonly attemptedPath: string,
    public readonly baseDir: string
  ) {
    super(`Path traversal detected: "${attemptedPath}" escapes base directory`);
    this.name = 'PathTraversalError';
  }
}

/**
 * Validates that a resolved path stays within the base directory.
 * Throws PathTraversalError if the path escapes.
 */
function assertPathWithinBase(baseDir: string, filePath: string): string {
  // Normalize the base directory
  const normalizedBase = normalize(resolve(baseDir));

  // Resolve the full path
  const fullPath = resolve(baseDir, filePath);

  // Check if the resolved path starts with the base directory
  // Add sep to prevent prefix attacks (e.g., /base-evil matching /base)
  if (!fullPath.startsWith(normalizedBase + sep) && fullPath !== normalizedBase) {
    throw new PathTraversalError(filePath, baseDir);
  }

  return fullPath;
}

/**
 * Install skill files from manifest
 */
function installSkillFiles(manifest: SkillManifest, skillDir: string): void {
  mkdirSync(skillDir, { recursive: true });

  for (const file of manifest.files) {
    // Validate path doesn't escape skill directory (defense in depth)
    const filePath = assertPathWithinBase(skillDir, file.path);
    // Prevent writes through pre-existing symlinks inside the destination tree.
    assertNoSymlinkPathComponents(skillDir, file.path);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, file.content, 'utf-8');
  }
}

export async function add(
  input: string,
  options: {
    force?: boolean;
    yes?: boolean;
    global?: boolean;
    project?: boolean;
    agent?: string[];
  }
): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' vett add ')));

  const s = p.spinner();

  // Step 1: Resolve skill via the server
  s.start('Checking registry');
  let detail: ApiSkillDetail;
  try {
    const response = await resolveSkill(input);

    if (response.status === 'not_found') {
      s.stop('Not found');
      p.log.error(response.message);
      p.outro(pc.red('Installation failed'));
      process.exit(1);
    }

    if (response.status === 'ready') {
      s.stop('Found in registry');
      detail = response.skill;
    } else {
      // processing — poll for completion
      s.stop('Submitted for analysis');

      s.start('Analyzing skill');
      const pollStart = Date.now();
      let job;
      try {
        job = await waitForJob(response.jobId, {
          onProgress: (statusJob) => {
            if (statusJob.message) {
              s.message(statusJob.message);
              return;
            }
            if (statusJob.status === 'processing') {
              s.message('Analyzing skill');
            } else if (statusJob.status === 'pending') {
              const elapsed = Date.now() - pollStart;
              s.message(
                elapsed > 15_000 ? 'Waiting for available slot...' : 'Waiting for analysis to start'
              );
            }
          },
        });
      } catch (error) {
        s.stop('Analysis failed');
        if (error instanceof UpgradeRequiredError) {
          p.outro(pc.red('Installation failed'));
          throw error;
        }
        p.log.error((error as Error).message);
        p.outro(pc.red('Installation failed'));
        process.exit(1);
      }

      if (job.status === 'failed') {
        s.stop('Analysis failed');
        p.log.error(job.hint || job.message || job.error || 'Unknown error');
        p.outro(pc.red('Installation failed'));
        process.exit(1);
      }

      s.stop('Analysis complete');
      if (job.startedAt && job.completedAt) {
        const durationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
        if (durationMs > 0) {
          const seconds = Math.round(durationMs / 1000);
          p.log.info(pc.dim(`Analysis completed in ${seconds}s`));
        }
      }

      // Fetch full detail after job completes — use the slug from the
      // completed job (authoritative) with fallback to the processing response.
      const slug = job.slug ?? response.slug;
      if (!slug) {
        p.log.error('Server did not return a slug for the completed skill');
        p.outro(pc.red('Installation failed'));
        process.exit(1);
      }

      s.start('Fetching skill details');
      const fetchedDetail = await getSkillDetail(slug);
      if (!fetchedDetail || fetchedDetail.versions.length === 0) {
        s.stop('Failed');
        p.log.error('Skill not found in registry after analysis completed');
        p.outro(pc.red('Installation failed'));
        process.exit(1);
      }
      s.stop('Fetched');
      detail = fetchedDetail;
    }
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      s.stop('Registry lookup failed');
      p.outro(pc.red('Installation failed'));
      throw error;
    }
    if (error instanceof RateLimitError) {
      s.stop('Registry lookup failed');
      p.log.error(`Rate limit exceeded. Please wait ${error.retryAfter} seconds and try again.`);
      p.outro(pc.red('Installation failed'));
      process.exit(1);
    }
    // Re-throw process.exit calls (they manifest as errors in test)
    throw error;
  }

  // Step 2: Select version
  const version = selectVersion(detail);
  const resolved: ResolvedResult = {
    skill: toSkillInfo(detail),
    version: toVersionInfo(version),
  };

  const verdict = getVerdict(resolved.version.risk as RiskLevel);

  // Display skill info
  p.note(formatSkillInfo(resolved), detail.slug);

  // Block critical-risk skills
  if (verdict === 'blocked') {
    p.log.error('Potential malicious behavior detected');
    p.outro(pc.red('Installation refused'));
    process.exit(1);
  }

  // Show strong warning for high-risk skills
  if (verdict === 'caution') {
    p.log.warn(pc.red('This skill has significant security concerns.'));
    p.log.warn(pc.red('Review the security findings above carefully before proceeding.'));
  }

  // Auto-approve or prompt
  let shouldInstall = options.yes;
  if (!shouldInstall) {
    const confirmMessage =
      verdict === 'caution' ? 'I understand the risks. Install this skill?' : 'Install this skill?';
    const confirmResult = await p.confirm({
      message: confirmMessage,
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
  const existing = getInstalledSkillBySlug(detail.slug);
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
  if (!detail.id) {
    p.log.error('Server did not return a skill ID required for download');
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }

  s.start('Downloading and verifying');
  let manifestContent: ArrayBuffer;
  try {
    manifestContent = await downloadArtifact(
      detail.id,
      resolved.version.version,
      resolved.version.hash
    );
  } catch (error) {
    s.stop('Download failed');
    if (error instanceof UpgradeRequiredError) {
      p.outro(pc.red('Installation failed'));
      throw error;
    }
    p.log.error((error as Error).message);
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }
  s.stop('Downloaded and verified');

  // Parse manifest
  const manifestJson = JSON.parse(Buffer.from(manifestContent).toString('utf-8'));
  // Byte-size limits are server-enforced; keep CLI validation focused on structure + path safety.
  const manifestResult = createSkillManifestSchema({
    maxFileBytes: Number.MAX_SAFE_INTEGER,
    maxTotalBytes: Number.MAX_SAFE_INTEGER,
  }).safeParse(manifestJson);
  if (!manifestResult.success) {
    s.stop('Invalid manifest');
    p.log.error(
      `Skill manifest failed validation: ${manifestResult.error.issues.map((i) => i.message).join(', ')}`
    );
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }
  const manifest = manifestResult.data as SkillManifest;

  // Verify signature (always required)
  s.start('Verifying signature');
  try {
    // Use original downloaded bytes for verification, not re-serialized manifest
    await verifyManifestOrThrow(Buffer.from(manifestContent), resolved.version);
  } catch (error) {
    s.stop('Signature verification failed');
    p.log.error((error as Error).message);
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }
  s.stop('Signature verified');
  p.log.info(pc.dim(`Integrity verified (Sigstore · Rekor transparency log)`));

  // Install files to vett canonical location
  s.start('Installing to vett');
  const skillDir = getSkillDir(resolved.skill.owner, resolved.skill.repo, resolved.skill.name);
  installSkillFiles(manifest, skillDir);
  s.stop('Installed to vett');

  // Determine installation scope
  const isGlobal = options.project ? false : (options.global ?? true);
  const scope = isGlobal ? 'global' : 'project';

  // Determine target agents
  let targetAgents: AgentType[];

  if (options.agent && options.agent.length > 0) {
    // User specified agents via -a flag
    const { valid, invalid } = parseAgentTypes(options.agent);
    if (invalid.length > 0) {
      p.log.warn(`Unknown agent(s): ${invalid.join(', ')}`);
    }
    if (valid.length === 0) {
      p.log.warn('No valid agents specified. Skill installed to vett only.');
      targetAgents = [];
    } else {
      targetAgents = valid;
    }
  } else {
    // Auto-detect installed agents
    s.start('Detecting agents');
    targetAgents = await detectInstalledAgents();
    s.stop(
      targetAgents.length > 0
        ? `Detected ${targetAgents.length} agent${targetAgents.length === 1 ? '' : 's'}`
        : 'No agents detected'
    );
  }

  // Install to agent locations
  let installedAgentNames: string[] = [];
  if (targetAgents.length > 0) {
    s.start('Installing to agents');
    const results = await installToAgents(skillDir, resolved.skill.name, targetAgents, {
      global: isGlobal,
    });

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (failed.length > 0) {
      for (const f of failed) {
        p.log.warn(`${f.agentDisplayName}: ${f.error}`);
      }
    }

    installedAgentNames = successful.map((r) => r.agentDisplayName);
    const symlinkCount = successful.filter((r) => r.mode === 'symlink').length;
    const copyCount = successful.filter((r) => r.mode === 'copy').length;

    if (successful.length > 0) {
      let modeInfo = '';
      if (symlinkCount > 0 && copyCount > 0) {
        modeInfo = ` (${symlinkCount} symlinked, ${copyCount} copied)`;
      } else if (copyCount > 0) {
        modeInfo = ' (copied)';
      }
      s.stop(
        `Installed to ${successful.length} agent${successful.length === 1 ? '' : 's'}${modeInfo}`
      );
    } else {
      s.stop('No agents installed');
    }
  }

  // Update config
  addInstalledSkill({
    owner: resolved.skill.owner,
    repo: resolved.skill.repo,
    name: resolved.skill.name,
    version: resolved.version.version,
    installedAt: new Date(),
    path: skillDir,
    slug: detail.slug,
    agents: targetAgents,
    scope,
  });

  // Summary
  p.log.success(`${detail.slug}@${resolved.version.version}`);
  p.log.info(`${pc.dim('Canonical:')} ${skillDir}`);

  if (installedAgentNames.length > 0) {
    p.log.info(`${pc.dim('Agents:')} ${installedAgentNames.join(', ')} (${scope})`);
  } else {
    p.log.info(pc.dim('No agents configured. Use -a <agent> to target specific agents.'));
  }

  p.outro(pc.green('Done'));
}

export function selectVersion(skill: ApiSkillDetail, version?: string): ApiSkillVersion {
  if (version) {
    const found = skill.versions.find(
      (candidate: ApiSkillVersion) => candidate.version === version
    );
    if (!found) {
      throw new Error(`Version ${version} not found in registry`);
    }
    return found;
  }

  if (!skill.versions[0]) {
    throw new Error('No versions available for this skill');
  }

  return skill.versions[0];
}

function toSkillInfo(skill: ApiSkillDetail): SkillInfo {
  return {
    slug: skill.slug,
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    description: skill.description ?? null,
  };
}

function toVersionInfo(version: ApiSkillVersion): VersionInfo {
  return {
    version: version.version,
    hash: version.hash,
    size: version.size ?? 0,
    risk: version.risk as RiskLevel | null,
    summary: version.summary ?? null,
    analysis: version.analysis as AnalysisResult | null,
    sigstoreBundle: version.sigstoreBundle ?? null,
  };
}
