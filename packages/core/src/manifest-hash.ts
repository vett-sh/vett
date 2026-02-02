import { createHash } from 'crypto';
import type { SkillManifest } from './manifest';

export function computeManifestHash(manifest: SkillManifest): string {
  const content = manifest.files
    .map((file) => `${file.path}:${file.content}`)
    .sort()
    .join('\n');
  const header = `${manifest.schemaVersion}:${manifest.entryPoint ?? ''}`;
  const data = `${header}\n${content}`;

  return createHash('sha256').update(data).digest('hex');
}
