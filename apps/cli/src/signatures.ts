/**
 * Sigstore signature verification for CLI
 *
 * Verifies Sigstore bundles containing ECDSA P-256 signatures with Rekor transparency log.
 */

import { verify } from 'sigstore';
import type { SerializedBundle } from '@sigstore/bundle';

// =============================================================================
// Production Signing Key
// =============================================================================
// Update these values when rotating the signing key.
// The corresponding private key must be set in the server environment.

const SIGNING_KEY_ID = 'v1-ecdsa-2025-02-04';

const SIGNING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEpLgag/JqlL70ydbJb5xZOFANSzdV
TShO8PIRRUhkmIhHkxyBS2KOIkev+jc2xerSjQqRcDGxdrUmRMKuCMtADw==
-----END PUBLIC KEY-----`;

// =============================================================================

/**
 * Key selector callback for sigstore verify.
 * Returns the public key for verification based on the key hint in the bundle.
 */
function keySelector(hint: string): string {
  if (hint === SIGNING_KEY_ID) {
    return SIGNING_PUBLIC_KEY;
  }

  throw new Error(
    `Unknown signing key: "${hint}". Expected: "${SIGNING_KEY_ID}". ` +
      'This may indicate a key rotation - try updating the vett CLI.'
  );
}

/**
 * Verify a Sigstore bundle against manifest bytes.
 *
 * Validates:
 * - Signature is valid for the manifest
 * - Public key matches expected vett signing key
 * - Rekor transparency log inclusion
 *
 * @param manifestBytes - The manifest content to verify
 * @param serializedBundle - JSON-serialized Sigstore bundle from the API
 */
export async function verifySigstoreBundle(
  manifestBytes: Buffer,
  serializedBundle: unknown
): Promise<void> {
  try {
    // sigstore's verify accepts the serialized bundle format directly
    // Type assertion is safe as verify will throw if bundle is invalid
    await verify(serializedBundle as SerializedBundle, manifestBytes, {
      keySelector,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Sigstore verification failed: ${message}`);
  }
}

/**
 * Verify manifest signature using Sigstore bundle.
 */
export async function verifyManifestOrThrow(
  manifestBytes: Buffer,
  version: {
    sigstoreBundle?: unknown;
  }
): Promise<void> {
  if (!version.sigstoreBundle) {
    throw new Error(
      'No Sigstore bundle found - skill is unsigned or uses deprecated legacy signing.'
    );
  }

  await verifySigstoreBundle(manifestBytes, version.sigstoreBundle);
}
