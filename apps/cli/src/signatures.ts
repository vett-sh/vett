import { serializeManifest, verifyManifestSignature } from '@vett/core/manifest-signature';
import type { SkillManifest } from '@vett/core';
import { getSigningKeys } from './api';

const PUBLIC_KEY_ENV = 'VETT_SIGNING_PUBLIC_KEY';
const KEY_ID_ENV = 'VETT_SIGNING_KEY_ID';

export interface SignatureMeta {
  signatureHash: string | null;
  signature: string | null;
  signatureKeyId: string | null;
  signatureCreatedAt: string | null;
}

function normalizeKey(value: string): string {
  if (value.includes('BEGIN')) {
    return value;
  }

  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch {
    return value;
  }
}

async function resolvePublicKey(keyId: string): Promise<string | null> {
  const envKeyId = process.env[KEY_ID_ENV];
  const envPublicKey = process.env[PUBLIC_KEY_ENV];
  if (envKeyId && envPublicKey && envKeyId === keyId) {
    return normalizeKey(envPublicKey);
  }

  const response = await getSigningKeys();
  const found = response.keys.find((entry) => entry.keyId === keyId);
  return found ? normalizeKey(found.publicKey) : null;
}

export async function verifyManifestOrThrow(
  manifest: SkillManifest,
  signatureMeta: SignatureMeta
): Promise<void> {
  if (
    !signatureMeta.signature ||
    !signatureMeta.signatureHash ||
    !signatureMeta.signatureKeyId ||
    !signatureMeta.signatureCreatedAt
  ) {
    throw new Error('Missing signature metadata from registry.');
  }

  const publicKey = await resolvePublicKey(signatureMeta.signatureKeyId);
  if (!publicKey) {
    throw new Error(`No public key found for key ID ${signatureMeta.signatureKeyId}.`);
  }

  const signature = {
    keyId: signatureMeta.signatureKeyId,
    hash: signatureMeta.signatureHash,
    signature: signatureMeta.signature,
    createdAt: signatureMeta.signatureCreatedAt,
  };

  const manifestBytes = serializeManifest(manifest);
  const ok = verifyManifestSignature(manifestBytes, signature, publicKey);
  if (!ok) {
    throw new Error('Signature verification failed.');
  }
}
