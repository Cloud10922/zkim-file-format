/**
 * Encryption Service Interface
 * Abstract interface for encryption operations used by wire format utilities
 */

export interface IEncryptionService {
  /**
   * Decrypt user layer encryption
   * Returns file metadata and content key
   */
  decryptUserLayer(
    userEncrypted: Uint8Array,
    userKey: Uint8Array,
    nonce: Uint8Array
  ): Promise<{
    fileId: string;
    contentKey: Uint8Array;
    metadata: Record<string, unknown>;
  }>;

  /**
   * Decrypt platform layer encryption (optional)
   * Returns search metadata
   */
  decryptPlatformLayer(
    platformEncrypted: Uint8Array,
    platformKey: Uint8Array,
    nonce: Uint8Array
  ): Promise<Record<string, unknown>>;
}

