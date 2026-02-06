import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, normalize, sep } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  ingestSkill,
  waitForJob,
  downloadArtifact,
  getSkillByRef,
  getSkillByUrl,
  RateLimitError,
} from '../api';
import { getSkillDir, addInstalledSkill, getInstalledSkill } from '../config';
import { verifyManifestOrThrow } from '../signatures';
import { createSkillManifestSchema, skillRefSchema, parseSkillUrl } from '@vett/core';
import type {
  AnalysisResult,
  RiskLevel,
  SkillManifest,
  SkillDetail,
  SkillVersion,
} from '@vett/core';
import { detectInstalledAgents, parseAgentTypes, agents, type AgentType } from '../agents';
import { installToAgents } from '../installer';
import { assertNoSymlinkPathComponents } from '../lib/fs-safety';

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
  artifactUrl: string;
  size: number;
  risk: RiskLevel | null;
  summary: string | null;
  analysis: AnalysisResult | null;
  sigstoreBundle: unknown | null;
}

interface SkillInfo {
  owner: string;
  repo: string;
  name: string;
  description: string | null;
}

interface ResolvedResult {
  skill: SkillInfo;
  version: VersionInfo;
}

async function resolveFromPublicRegistry(
  ingestUrl: string,
  expectedRef: { owner?: string; repo?: string; name?: string }
): Promise<ResolvedResult> {
  // Prefer URL lookup (works even if repo/name parsing changes); fall back to name lookup if present.
  const byUrl = await getSkillByUrl(ingestUrl);
  const skill: SkillDetail | null =
    byUrl ??
    (expectedRef.owner && expectedRef.repo && expectedRef.name
      ? await getSkillByRef(expectedRef.owner, expectedRef.repo, expectedRef.name)
      : null);

  if (!skill || !skill.versions || skill.versions.length === 0) {
    throw new Error('Skill not found in registry after ingestion completed');
  }

  // The API returns versions sorted newest-first; take the latest.
  const version: SkillVersion = skill.versions[0]!;
  return {
    skill: toSkillInfo(skill),
    version: toVersionInfo(version),
  };
}

async function resolveFromRegistryWithRetries(
  ingestUrl: string,
  expectedRef: { owner?: string; repo?: string; name?: string }
): Promise<ResolvedResult> {
  // Ingest job may flip to "complete" slightly before the skill/version is queryable.
  const deadline = Date.now() + 10_000;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      return await resolveFromPublicRegistry(ingestUrl, expectedRef);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Failed to resolve from registry');
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw lastError ?? new Error('Failed to resolve from registry');
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
    `${verdictIcon} ${verdictLabel} ${pc.dim('·')} ${pc.dim(`${skill.owner}/${skill.repo}`)}`
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
 * Extract a commit SHA from a parsed ref, returning null for branch/tag refs.
 * Only matches full 40-char hex SHAs to avoid misidentifying hex-only
 * branch or tag names (e.g. "cafebabe", "deadbeef") as commit refs.
 */
function extractCommitRef(ref: string | undefined): string | null {
  if (!ref) return null;
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.toLowerCase() : null;
}

/**
 * Resolve the current source fingerprint for a URL.
 * - Git hosts: latest commit SHA touching the skill path.
 * - HTTP: SHA-256 of the raw content.
 * Returns null if the check fails (network error, rate limit, etc.).
 */
async function resolveCurrentFingerprint(
  parsedUrl: ReturnType<typeof parseSkillUrl>
): Promise<string | null> {
  try {
    if (parsedUrl.host === 'github.com' && parsedUrl.owner && parsedUrl.repo && parsedUrl.path) {
      const ref = parsedUrl.ref ?? 'main';
      const url = `https://api.github.com/repos/${parsedUrl.owner}/${parsedUrl.repo}/commits?path=${encodeURIComponent(parsedUrl.path)}&sha=${encodeURIComponent(ref)}&per_page=1`;
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Array<{ sha?: string }>;
      return data[0]?.sha ?? null;
    }

    // HTTP sources: fetch content and hash it
    const res = await fetch(parsedUrl.sourceUrl, {
      headers: { 'User-Agent': 'vett-cli' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const content = await res.text();
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
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

  const parsed = parseAddInput(input);
  let resolved: ResolvedResult | null = null;
  let ingestUrl = input;

  s.start('Checking registry');
  try {
    if (parsed.kind === 'ref') {
      const skill = await getSkillByRef(parsed.owner, parsed.repo, parsed.name);
      if (skill) {
        resolved = {
          skill: toSkillInfo(skill),
          version: toVersionInfo(selectVersion(skill, parsed.version)),
        };
      } else {
        ingestUrl = `https://github.com/${parsed.owner}/${parsed.repo}/tree/${parsed.version || 'main'}/${parsed.name}`;
      }
    } else {
      const skill = await getSkillByUrl(parsed.url);
      if (skill) {
        const parsedUrl = parseSkillUrl(parsed.url);
        const commitSha = extractCommitRef(parsedUrl.ref);

        if (commitSha) {
          // Pinned to a specific commit — find that exact version
          const match = skill.versions.find((v) => v.commitSha === commitSha);
          if (match) {
            resolved = { skill: toSkillInfo(skill), version: toVersionInfo(match) };
          }
          // else: specific commit not yet ingested — fall through to ingestion
        } else {
          // Non-pinned URL — check if source has changed since last ingest
          const currentFingerprint = await resolveCurrentFingerprint(parsedUrl);
          const latest = selectVersion(skill);
          if (
            currentFingerprint &&
            latest.sourceFingerprint &&
            currentFingerprint === latest.sourceFingerprint
          ) {
            // Source unchanged — use cached version
            resolved = { skill: toSkillInfo(skill), version: toVersionInfo(latest) };
          }
          // else: source changed or no fingerprint — fall through to ingestion
        }
      }
    }
  } catch (error) {
    s.stop('Registry lookup failed');
    if (error instanceof RateLimitError) {
      p.log.error(`Rate limit exceeded. Please wait ${error.retryAfter} seconds and try again.`);
    } else {
      p.log.error((error as Error).message);
    }
    p.outro(pc.red('Installation failed'));
    process.exit(1);
  }

  if (resolved) {
    s.stop('Found in registry');
  } else {
    s.stop('Not found in registry');

    // Submit for ingestion
    s.start('Submitting for analysis');
    let ingestResponse;
    try {
      ingestResponse = await ingestSkill(ingestUrl);
    } catch (error) {
      s.stop('Submission failed');
      if (error instanceof RateLimitError) {
        p.log.error(`Rate limit exceeded. Please wait ${error.retryAfter} seconds and try again.`);
      } else {
        p.log.error((error as Error).message);
      }
      p.outro(pc.red('Installation failed'));
      process.exit(1);
    }
    s.stop('Submitted');

    // Poll for completion
    s.start('Analyzing skill');
    let job;
    try {
      job = await waitForJob(ingestResponse.jobId, {
        onProgress: (statusJob) => {
          if (statusJob.status === 'processing') {
            s.message('Analyzing skill');
          } else if (statusJob.status === 'pending') {
            s.message('Waiting for analysis to start');
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
    if (job.startedAt && job.completedAt) {
      const durationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
      if (durationMs > 0) {
        const seconds = Math.round(durationMs / 1000);
        p.log.info(pc.dim(`Analysis completed in ${seconds}s`));
      }
    }
    // Resolve result via public registry endpoints rather than embedding results in job payload.
    // This reduces jobId-based information disclosure and keeps the CLI aligned with canonical API data.
    resolved = await resolveFromRegistryWithRetries(ingestUrl, {
      owner: parsed.kind === 'ref' ? parsed.owner : undefined,
      repo: parsed.kind === 'ref' ? parsed.repo : undefined,
      name: parsed.kind === 'ref' ? parsed.name : undefined,
    });
  }

  const verdict = getVerdict(resolved.version.risk as RiskLevel);

  // Display skill info
  const skillRef = `${resolved.skill.owner}/${resolved.skill.repo}/${resolved.skill.name}`;
  p.note(formatSkillInfo(resolved), skillRef);

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
  const existing = getInstalledSkill(
    resolved.skill.owner,
    resolved.skill.repo,
    resolved.skill.name
  );
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
    manifestContent = await downloadArtifact(resolved.version.artifactUrl, resolved.version.hash);
  } catch (error) {
    s.stop('Download failed');
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
    agents: targetAgents,
    scope,
  });

  // Summary
  p.log.success(
    `${resolved.skill.owner}/${resolved.skill.repo}/${resolved.skill.name}@${resolved.version.version}`
  );
  p.log.info(`${pc.dim('Canonical:')} ${skillDir}`);

  if (installedAgentNames.length > 0) {
    p.log.info(`${pc.dim('Agents:')} ${installedAgentNames.join(', ')} (${scope})`);
  } else {
    p.log.info(pc.dim('No agents configured. Use -a <agent> to target specific agents.'));
  }

  p.outro(pc.green('Done'));
}

function selectVersion(skill: SkillDetail, version?: string): SkillVersion {
  if (version) {
    const found = skill.versions.find((candidate) => candidate.version === version);
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

function toSkillInfo(skill: SkillDetail): SkillInfo {
  return {
    owner: skill.owner,
    repo: skill.repo,
    name: skill.name,
    description: skill.description,
  };
}

function toVersionInfo(version: SkillVersion): VersionInfo {
  return {
    version: version.version,
    hash: version.hash,
    artifactUrl: version.artifactUrl,
    size: version.size,
    risk: version.risk as RiskLevel | null,
    summary: version.summary,
    analysis: version.analysis,
    sigstoreBundle: version.sigstoreBundle ?? null,
  };
}

type AddInput =
  | { kind: 'ref'; owner: string; repo: string; name: string; version?: string }
  | { kind: 'url'; url: string };

export function parseAddInput(input: string): AddInput {
  const refResult = skillRefSchema.safeParse(input);
  if (refResult.success) {
    const atIndex = input.lastIndexOf('@');
    let skillPath = input;
    let version: string | undefined;

    if (atIndex > 0) {
      skillPath = input.slice(0, atIndex);
      version = input.slice(atIndex + 1);
    }

    const parts = skillPath.split('/');
    return {
      kind: 'ref',
      owner: parts[0],
      repo: parts[1],
      name: parts[2],
      version,
    };
  }

  return { kind: 'url', url: input };
}
