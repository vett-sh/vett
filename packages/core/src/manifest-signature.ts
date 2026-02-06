import type { SkillManifest } from './manifest';

export function serializeManifest(manifest: SkillManifest): Buffer {
  return Buffer.from(JSON.stringify(manifest), 'utf-8');
}
