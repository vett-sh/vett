import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifySigstoreBundle, verifyManifestOrThrow } from './signatures';

// Mock the sigstore library
vi.mock('sigstore', () => ({
  verify: vi.fn(),
}));

import { verify } from 'sigstore';
const mockVerify = vi.mocked(verify);

describe('Sigstore verification', () => {
  const manifestBytes = Buffer.from('{"test": "manifest"}');
  const validBundle = {
    mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.2',
    verificationMaterial: {},
    messageSignature: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifySigstoreBundle', () => {
    it('calls sigstore verify with keySelector', async () => {
      mockVerify.mockResolvedValueOnce(undefined as never);

      await verifySigstoreBundle(manifestBytes, validBundle as never);

      expect(mockVerify).toHaveBeenCalledWith(validBundle, manifestBytes, {
        keySelector: expect.any(Function),
      });
    });

    it('throws on verification failure', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Invalid signature'));

      await expect(verifySigstoreBundle(manifestBytes, validBundle as never)).rejects.toThrow(
        'Sigstore verification failed: Invalid signature'
      );
    });

    it('handles non-Error rejection', async () => {
      mockVerify.mockRejectedValueOnce('string error');

      await expect(verifySigstoreBundle(manifestBytes, validBundle as never)).rejects.toThrow(
        'Sigstore verification failed: Unknown error'
      );
    });
  });

  describe('verifyManifestOrThrow', () => {
    it('verifies when sigstoreBundle is present', async () => {
      mockVerify.mockResolvedValueOnce(undefined as never);

      await verifyManifestOrThrow(manifestBytes, { sigstoreBundle: validBundle });

      expect(mockVerify).toHaveBeenCalled();
    });

    it('throws when sigstoreBundle is missing', async () => {
      await expect(verifyManifestOrThrow(manifestBytes, {})).rejects.toThrow(
        'No Sigstore bundle found'
      );
    });

    it('throws when sigstoreBundle is null', async () => {
      await expect(verifyManifestOrThrow(manifestBytes, { sigstoreBundle: null })).rejects.toThrow(
        'No Sigstore bundle found'
      );
    });

    it('throws when sigstoreBundle is undefined', async () => {
      await expect(
        verifyManifestOrThrow(manifestBytes, { sigstoreBundle: undefined })
      ).rejects.toThrow('No Sigstore bundle found');
    });
  });
});
