import { createHash, sign, verify } from 'crypto';
import type { SkillManifest } from './manifest';

export interface ManifestSignature {
  keyId: string;
  hash: string;
  signature: string;
  createdAt: string;
}

export function serializeManifest(manifest: SkillManifest): Buffer {
  return Buffer.from(JSON.stringify(manifest), 'utf-8');
}

export function computeManifestArtifactHash(manifestBytes: Buffer): string {
  return createHash('sha256').update(manifestBytes).digest('hex');
}

export function signManifestBytes(
  manifestBytes: Buffer,
  options: { keyId: string; privateKey: string | Buffer; createdAt?: Date }
): ManifestSignature {
  const hash = computeManifestArtifactHash(manifestBytes);
  const signature = sign(null, Buffer.from(hash, 'hex'), options.privateKey);

  return {
    keyId: options.keyId,
    hash,
    signature: signature.toString('base64'),
    createdAt: (options.createdAt ?? new Date()).toISOString(),
  };
}

export function verifyManifestSignature(
  manifestBytes: Buffer,
  signature: ManifestSignature,
  publicKey: string | Buffer
): boolean {
  const hash = computeManifestArtifactHash(manifestBytes);
  if (hash !== signature.hash) {
    return false;
  }

  return verify(
    null,
    Buffer.from(signature.hash, 'hex'),
    publicKey,
    Buffer.from(signature.signature, 'base64')
  );
}
