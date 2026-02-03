import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { signManifestBytes, serializeManifest } from '@vett/core/manifest-signature';
import { SKILL_MANIFEST_SCHEMA_VERSION, type SkillManifest } from '@vett/core';
import { verifyManifestOrThrow } from './signatures';

const fixture = (() => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

  return {
    keyId: 'cli-test-key',
    privateKeyPem,
    publicKeyPem,
  };
})();

vi.mock('./api', () => ({
  getSigningKeys: vi.fn(async () => ({
    keys: [{ keyId: fixture.keyId, publicKey: fixture.publicKeyPem }],
  })),
}));

const BASE_MANIFEST: SkillManifest = {
  schemaVersion: SKILL_MANIFEST_SCHEMA_VERSION,
  entryPoint: 'SKILL.md',
  files: [
    {
      path: 'SKILL.md',
      content: '# Demo',
      contentType: 'text/markdown',
    },
  ],
};

describe('verifyManifestOrThrow', () => {
  it('accepts valid signatures', async () => {
    const manifestBytes = serializeManifest(BASE_MANIFEST);
    const signature = signManifestBytes(manifestBytes, {
      keyId: fixture.keyId,
      privateKey: fixture.privateKeyPem,
    });

    await expect(
      verifyManifestOrThrow(manifestBytes, {
        signatureHash: signature.hash,
        signature: signature.signature,
        signatureKeyId: signature.keyId,
        signatureCreatedAt: signature.createdAt,
      })
    ).resolves.toBeUndefined();
  });

  it('rejects invalid signatures', async () => {
    const manifestBytes = serializeManifest(BASE_MANIFEST);
    const signature = signManifestBytes(manifestBytes, {
      keyId: fixture.keyId,
      privateKey: fixture.privateKeyPem,
    });

    await expect(
      verifyManifestOrThrow(manifestBytes, {
        signatureHash: `${signature.hash.slice(0, -1)}0`,
        signature: `${signature.signature}broken`,
        signatureKeyId: signature.keyId,
        signatureCreatedAt: signature.createdAt,
      })
    ).rejects.toThrow('Signature verification failed.');
  });
});
