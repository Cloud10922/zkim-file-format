/**
 * ZKIM File Wire Format Utilities
 *
 * Contains all wire format I/O operations for ZKIM files.
 * Wire Format: MAGIC + VERSION + FLAGS + KEM_CIPHERTEXT(1,088 bytes ML-KEM-768) + EH_PLATFORM + EH_USER + CHUNKS + MERKLE_ROOT + SIG
 *
 * Part of ZKIM's Level 3+ security implementation.
 * Uses NIST-standardized ML-KEM-768 (FIPS 203) and ML-DSA-65 (FIPS 204).
 * NOT FIPS 140-3 validated by an accredited laboratory.
 *
 * This module exports pure functions (not class methods) for wire format operations.
 */

import sodium from "libsodium-wrappers-sumo";

import { blake3 } from "@noble/hashes/blake3.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

import { ErrorUtils } from "../utils/error-handling";
import { ServiceError } from "../types/errors";
import type { ILogger } from "../utils/logger";
import { defaultLogger } from "../utils/logger";

import type {
  ZkimFile,
  ZkimFileChunk,
  ZkimFileHeader,
  ZkimFileMetadata,
} from "../types/zkim-file-format";
import type { IEncryptionService } from "./encryption-interface";

import { ZKIM_ENCRYPTION_CONSTANTS } from "../constants";

// Binary format constants
const U16_MASK = 0xff;
const U16_SHIFT_BITS = 8;
const U16_BYTES = 2;

/**
 * Write little-endian u16
 */
export function writeU16(value: number): Uint8Array {
  const bytes = new Uint8Array(U16_BYTES);
  bytes[0] = value & U16_MASK;
  bytes[1] = (value >> U16_SHIFT_BITS) & U16_MASK;
  return bytes;
}

/**
 * Read little-endian u16
 */
export function readU16(buffer: Uint8Array, offset: number): number {
  if (offset + 1 >= buffer.length) {
    throw new ServiceError("Buffer too short for u16 read", {
      code: "BUFFER_TOO_SHORT",
      details: { offset, bufferLength: buffer.length },
    });
  }
  const first = buffer[offset];
  const second = buffer[offset + 1];
  if (first === undefined || second === undefined) {
    throw new ServiceError("Invalid buffer access for u16 read", {
      code: "INVALID_BUFFER_ACCESS",
      details: { offset, bufferLength: buffer.length },
    });
  }
  return first | (second << U16_SHIFT_BITS);
}

/**
 * Format EH header: nonce24 || tag16 (40 bytes fixed)
 * Ciphertext is stored in chunks, not in EH header
 */
export function formatEhHeader(
  nonce: Uint8Array,
  data: { ciphertext: Uint8Array; tag: Uint8Array } | Uint8Array
): Uint8Array {
  if (nonce.length !== ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE) {
    throw new ServiceError(
      `Invalid nonce length: expected ${ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE}, got ${nonce.length}`,
      {
        code: "INVALID_NONCE_LENGTH",
        details: {
          expectedLength: ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE,
          actualLength: nonce.length,
        },
      }
    );
  }

  let tag: Uint8Array;

  if (data instanceof Uint8Array) {
    const tagSize = ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;
    const ciphertextSize = data.length - tagSize;
    if (ciphertextSize < 0) {
      throw new ServiceError(
        `Invalid encrypted data: too short for tag (length: ${data.length})`,
        {
          code: "INVALID_ENCRYPTED_DATA",
          details: { dataLength: data.length, tagSize },
        }
      );
    }
    tag = data.slice(ciphertextSize);
  } else {
    ({ tag } = data);
  }

  if (tag.length !== ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE) {
    throw new ServiceError(
      `Invalid tag length: expected ${ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE}, got ${tag.length}`,
      {
        code: "INVALID_TAG_LENGTH",
        details: {
          expectedLength: ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE,
          actualLength: tag.length,
        },
      }
    );
  }

  const header = new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE);
  header.set(nonce, 0);
  header.set(tag, ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE);

  return header;
}

/**
 * Parse EH header: extracts nonce24 and tag16
 */
export function parseEhHeader(header: Uint8Array): {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
} {
  if (header.length !== ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE) {
    throw new ServiceError(
      `Invalid EH header length: expected ${ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE}, got ${header.length}`,
      {
        code: "INVALID_EH_HEADER_LENGTH",
        details: {
          expectedLength: ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE,
          actualLength: header.length,
        },
      }
    );
  }

  const nonce = header.slice(0, ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE);
  const tag = header.slice(-ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE);
  const ciphertext = header.slice(
    ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE,
    header.length - ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE
  );

  return { nonce, ciphertext, tag };
}

/**
 * Calculate Merkle root from chunk integrity hashes using BLAKE3
 */
export function calculateMerkleRoot(chunks: ZkimFileChunk[]): Uint8Array {
  if (chunks.length === 0) {
    return new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE);
  }

  const leaves = chunks.map((chunk) => chunk.integrityHash).filter((hash): hash is Uint8Array => hash !== undefined);

  if (leaves.length === 0) {
    return new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE);
  }

  if (leaves.length === 1) {
    const leaf = leaves[0];
    if (!leaf) {
      return new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE);
    }
    return blake3(leaf, { dkLen: 32 });
  }

  let currentLevel: Uint8Array[] = leaves.map((leaf) => blake3(leaf, { dkLen: 32 }));

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const first = currentLevel[i];
      if (!first) {
        continue;
      }
      if (i + 1 < currentLevel.length) {
        const second = currentLevel[i + 1];
        if (second) {
          const combined = new Uint8Array(first.length + second.length);
          combined.set(first, 0);
          combined.set(second, first.length);
          nextLevel.push(blake3(combined, { dkLen: 32 }));
        } else {
          const combined = new Uint8Array(first.length * 2);
          combined.set(first, 0);
          combined.set(first, first.length);
          nextLevel.push(blake3(combined, { dkLen: 32 }));
        }
      } else {
        const combined = new Uint8Array(first.length * 2);
        combined.set(first, 0);
        combined.set(first, first.length);
        nextLevel.push(blake3(combined, { dkLen: 32 }));
      }
    }

    if (nextLevel.length === 0) {
      break;
    }
    currentLevel = nextLevel;
  }

  return (
    currentLevel[0] ??
    new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE)
  );
}

/**
 * Generate file signature: ML-DSA-65(BLAKE3("zkim/root" || root || manifestHash || algSuiteId || version))
 * Format uses ML-DSA-65 (FIPS 204)
 * Derives signing key from userKey using deterministic key generation with context "zkim/ml-dsa-65/file"
 * Matches infrastructure implementation for consistency
 */
export async function generateFileSignature(
  merkleRoot: Uint8Array,
  manifestHash: Uint8Array,
  algSuiteId: number,
  version: number,
  userKey: Uint8Array
): Promise<Uint8Array> {
  const context = ErrorUtils.createContext(
    "WireFormat",
    "generateFileSignature",
    {
      severity: "high",
    }
  );

  const result = await ErrorUtils.withErrorHandling(async () => {
    await sodium.ready;

    const prefix = new TextEncoder().encode("zkim/root");
    const versionBytes = writeU16(version);
    const algSuiteBytes = new Uint8Array([algSuiteId]);

    const signatureInput = new Uint8Array(
      prefix.length +
        merkleRoot.length +
        manifestHash.length +
        algSuiteBytes.length +
        versionBytes.length
    );

    let offset = 0;
    signatureInput.set(prefix, offset);
    offset += prefix.length;
    signatureInput.set(merkleRoot, offset);
    offset += merkleRoot.length;
    signatureInput.set(manifestHash, offset);
    offset += manifestHash.length;
    signatureInput.set(algSuiteBytes, offset);
    offset += algSuiteBytes.length;
    signatureInput.set(versionBytes, offset);

    const hashedInput = blake3(signatureInput, { dkLen: 32 });

    // ML-DSA-65 signature (FIPS 204)
    // Derive signing key from userKey using deterministic key generation
    // Context: "zkim/ml-dsa-65/file" (matches infrastructure)
    const seedContext = new TextEncoder().encode("zkim/ml-dsa-65/file");
    const combinedSeed = new Uint8Array(userKey.length + seedContext.length);
    combinedSeed.set(userKey);
    combinedSeed.set(seedContext, userKey.length);
    const seed = blake3(combinedSeed, { dkLen: 32 });

    const keypair = ml_dsa65.keygen(seed);
    // Correct parameter order: sign(message, secretKey)
    const signature = ml_dsa65.sign(hashedInput, keypair.secretKey);

    return signature;
  }, context);

  if (!result.success) {
    throw new ServiceError(
      `Failed to generate file signature: ${result.error}`,
      {
        code: "FILE_SIGNATURE_GENERATION_FAILED",
        details: { error: result.error },
      }
    );
  }

  if (!result.data) {
    throw new ServiceError(
      "File signature generation result data is undefined",
      {
        code: "FILE_SIGNATURE_DATA_MISSING",
      }
    );
  }

  return result.data;
}

/**
 * Calculate manifest hash (BLAKE3 of EH_USER header)
 */
export function calculateManifestHash(ehUser: Uint8Array): Uint8Array {
  return blake3(ehUser, { dkLen: 32 });
}

/**
 * Write ZKIM file in wire format according to spec
 * Wire Format: MAGIC + VERSION + FLAGS + KEM_CIPHERTEXT + EH_PLATFORM + EH_USER + CHUNKS + MERKLE_ROOT + SIG
 */
export function writeWireFormat(
  header: ZkimFileHeader,
  kemCipherText: Uint8Array,
  ehPlatform: Uint8Array,
  ehUser: Uint8Array,
  chunks: ZkimFileChunk[],
  merkleRoot: Uint8Array,
  signature: Uint8Array,
  logger: ILogger = defaultLogger
): Uint8Array {
  try {
    // Validate KEM ciphertext size (must be ML-KEM-768)
    if (kemCipherText.length !== ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE) {
      throw new ServiceError(
        `Invalid KEM ciphertext length: expected ${ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE} bytes (ML-KEM-768), got ${kemCipherText.length}`,
        {
          code: "INVALID_KEM_CIPHERTEXT_LENGTH",
          details: {
            expectedMLKEM768: ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE,
            actualLength: kemCipherText.length,
          },
        }
      );
    }

    // Validate inputs
    if (ehPlatform.length !== ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE) {
      throw new ServiceError(
        `Invalid EH_PLATFORM length: expected ${ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE}, got ${ehPlatform.length}`,
        {
          code: "INVALID_EH_PLATFORM_LENGTH",
          details: {
            expectedLength: ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE,
            actualLength: ehPlatform.length,
          },
        }
      );
    }
    if (ehUser.length !== ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE) {
      throw new ServiceError(
        `Invalid EH_USER length: expected ${ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE}, got ${ehUser.length}`,
        {
          code: "INVALID_EH_USER_LENGTH",
          details: {
            expectedLength: ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE,
            actualLength: ehUser.length,
          },
        }
      );
    }
    if (merkleRoot.length !== ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE) {
      throw new ServiceError(
        `Invalid Merkle root length: expected ${ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE}, got ${merkleRoot.length}`,
        {
          code: "INVALID_MERKLE_ROOT_LENGTH",
          details: {
            expectedLength: ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE,
            actualLength: merkleRoot.length,
          },
        }
      );
    }
    if (signature.length !== ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE) {
      throw new ServiceError(
        `Invalid signature length: expected ${ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE}, got ${signature.length}`,
        {
          code: "INVALID_SIGNATURE_LENGTH",
          details: {
            expectedLength: ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE,
            actualLength: signature.length,
          },
        }
      );
    }

    // Calculate sizes
    // MAGIC (4) + VERSION (2) + FLAGS (2) = 8 bytes
    const kemCipherTextOffset =
      ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE +
      ZKIM_ENCRYPTION_CONSTANTS.VERSION_BYTES_SIZE +
      ZKIM_ENCRYPTION_CONSTANTS.FLAGS_BYTES_SIZE; // 8 bytes
    const ehPlatformOffset =
      kemCipherTextOffset + ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE; // 1,096 bytes (after KEM ciphertext)
    const ehUserOffset =
      ehPlatformOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE; // 1,136 bytes (after EH_PLATFORM)
    const chunksOffset =
      ehUserOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE; // 1,176 bytes (after EH_USER)

    // Calculate total chunk size
    let chunksSize = 0;
    for (const chunk of chunks) {
      // Each chunk: nonce (24) + ciphertext + tag (16)
      // Note: encryptedData already includes tag, so we subtract tag size
      const tagSize = ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;
      const ciphertextSize = chunk.encryptedData.length - tagSize;
      chunksSize +=
        ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE + ciphertextSize + tagSize;
    }

    // Calculate total file size
    const merkleRootOffset = chunksOffset + chunksSize;
    const signatureOffset =
      merkleRootOffset + ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE;
    const totalSize =
      signatureOffset + ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE;

    // Allocate wire format buffer
    const wireFormat = new Uint8Array(totalSize);
    let offset = 0;

    // Write MAGIC (4 bytes)
    const magicBytes = new TextEncoder().encode("ZKIM");
    wireFormat.set(magicBytes, offset);
    offset += ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE;

    // Write VERSION (2 bytes, little-endian)
    const versionBytes = writeU16(header.version);
    wireFormat.set(versionBytes, offset);
    offset += ZKIM_ENCRYPTION_CONSTANTS.VERSION_BYTES_SIZE;

    // Write FLAGS (2 bytes, little-endian)
    const flagsBytes = writeU16(header.flags);
    wireFormat.set(flagsBytes, offset);
    offset += ZKIM_ENCRYPTION_CONSTANTS.FLAGS_BYTES_SIZE;

    // Write KEM_CIPHERTEXT at fixed position 0x08 (1,088 bytes ML-KEM-768)
    wireFormat.set(kemCipherText, kemCipherTextOffset);

    // Write EH_PLATFORM at fixed position after KEM ciphertext (40 bytes)
    wireFormat.set(ehPlatform, ehPlatformOffset);

    // Write EH_USER at fixed position 0x30 (40 bytes)
    wireFormat.set(ehUser, ehUserOffset);

    // Write chunks sequentially starting at 0x58
    offset = chunksOffset;
    for (const chunk of chunks) {
      // Write nonce (24 bytes)
      if (chunk.nonce.length !== ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE) {
        throw new ServiceError(
          `Invalid chunk nonce length: expected ${ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE}, got ${chunk.nonce.length}`,
          {
            code: "INVALID_CHUNK_NONCE_LENGTH",
            details: {
              chunkIndex: chunk.chunkIndex,
              expectedLength: ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE,
              actualLength: chunk.nonce.length,
            },
          }
        );
      }
      wireFormat.set(chunk.nonce, offset);
      offset += ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE;

      // Extract ciphertext and tag from encrypted data
      // crypto_secretbox_easy includes tag at the end of encrypted data (last TAG_SIZE bytes)
      const tagSize = ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;
      if (chunk.encryptedData.length < tagSize) {
        throw new ServiceError(
          `Chunk encrypted data too short for tag (length: ${chunk.encryptedData.length})`,
          {
            code: "CHUNK_DATA_TOO_SHORT",
            details: {
              chunkIndex: chunk.chunkIndex,
              dataLength: chunk.encryptedData.length,
              tagSize,
            },
          }
        );
      }
      const ciphertext = chunk.encryptedData.slice(
        0,
        chunk.encryptedData.length - tagSize
      );
      const tag = chunk.encryptedData.slice(-tagSize);

      // Write ciphertext (padded to bucket size)
      wireFormat.set(ciphertext, offset);
      offset += ciphertext.length;

      // Write tag (TAG_SIZE bytes)
      wireFormat.set(tag, offset);
      offset += tagSize;
    }

    // Write MERKLE_ROOT (MERKLE_ROOT_SIZE bytes)
    wireFormat.set(merkleRoot, merkleRootOffset);

    // Write SIGNATURE (SIGNATURE_SIZE bytes)
    wireFormat.set(signature, signatureOffset);

    logger.debug("Wire format written successfully", {
      totalSize,
      chunksCount: chunks.length,
      chunksSize,
      merkleRootOffset,
      signatureOffset,
    });

    return wireFormat;
  } catch (error) {
    logger.error("Failed to write wire format", error);
    throw error;
  }
}

/**
 * Parse ZKIM file from wire format according to spec
 */
export function parseWireFormat(
  buffer: Uint8Array,
  logger: ILogger = defaultLogger
): {
  magic: string;
  version: number;
  flags: number;
  kemCipherText: Uint8Array;
  ehPlatform: Uint8Array;
  ehUser: Uint8Array;
  chunks: Array<{
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    tag: Uint8Array;
  }>;
  merkleRoot: Uint8Array;
  signature: Uint8Array;
} {
  try {
    const headerSize =
      ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE +
      ZKIM_ENCRYPTION_CONSTANTS.VERSION_BYTES_SIZE +
      ZKIM_ENCRYPTION_CONSTANTS.FLAGS_BYTES_SIZE;
    if (buffer.length < headerSize) {
      throw new ServiceError("File too small for header", {
        code: "FILE_TOO_SMALL",
        details: {
          bufferLength: buffer.length,
          minHeaderSize: headerSize,
        },
      });
    }

    // Parse MAGIC (4 bytes)
    const magicBytes = buffer.slice(
      0,
      ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE
    );
    const magic = new TextDecoder().decode(magicBytes);
    if (magic !== "ZKIM") {
      throw new ServiceError(`Invalid magic: expected "ZKIM", got "${magic}"`, {
        code: "INVALID_MAGIC",
        details: { magic },
      });
    }

    const EXPECTED_VERSION = 0x0001;
    const EXPECTED_FLAGS = 0x0000;
    const HEX_RADIX = 16;

    const version = readU16(buffer, ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE);
    if (version !== EXPECTED_VERSION) {
      throw new ServiceError(
        `Invalid version: expected 0x${EXPECTED_VERSION.toString(HEX_RADIX)}, got 0x${version.toString(HEX_RADIX)}`,
        {
          code: "INVALID_VERSION",
          details: { version },
        }
      );
    }

    const flags = readU16(
      buffer,
      ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE +
        ZKIM_ENCRYPTION_CONSTANTS.VERSION_BYTES_SIZE
    );
    if (flags !== EXPECTED_FLAGS) {
      throw new ServiceError(
        `Invalid flags: expected 0x${EXPECTED_FLAGS.toString(HEX_RADIX)}, got 0x${flags.toString(HEX_RADIX)}`,
        {
          code: "INVALID_FLAGS",
          details: { flags },
        }
      );
    }

    // Parse KEM_CIPHERTEXT at fixed position (1,088 bytes ML-KEM-768)
    const kemCipherTextOffset =
      ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE +
      ZKIM_ENCRYPTION_CONSTANTS.VERSION_BYTES_SIZE +
      ZKIM_ENCRYPTION_CONSTANTS.FLAGS_BYTES_SIZE;
    if (
      buffer.length <
      kemCipherTextOffset + ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE
    ) {
      throw new ServiceError("File too small for KEM ciphertext", {
        code: "FILE_TOO_SMALL",
        details: {
          bufferLength: buffer.length,
          requiredSize: kemCipherTextOffset + ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE,
        },
      });
    }
    const kemCipherText = buffer.slice(
      kemCipherTextOffset,
      kemCipherTextOffset + ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE
    );

    // Parse EH_PLATFORM at fixed position after KEM ciphertext (EH_HEADER_SIZE bytes)
    const ehPlatformOffset = kemCipherTextOffset + ZKIM_ENCRYPTION_CONSTANTS.ML_KEM_768_CIPHERTEXT_SIZE;
    if (
      buffer.length <
      ehPlatformOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE
    ) {
      throw new ServiceError("File too small for EH_PLATFORM header", {
        code: "FILE_TOO_SMALL",
        details: {
          bufferLength: buffer.length,
          requiredSize:
            ehPlatformOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE,
        },
      });
    }
    const ehPlatform = buffer.slice(
      ehPlatformOffset,
      ehPlatformOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE
    );

    // Parse EH_USER at fixed position after EH_PLATFORM (EH_HEADER_SIZE bytes)
    const ehUserOffset =
      ehPlatformOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE;
    if (
      buffer.length <
      ehUserOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE
    ) {
      throw new ServiceError("File too small for EH_USER header", {
        code: "FILE_TOO_SMALL",
        details: {
          bufferLength: buffer.length,
          requiredSize: ehUserOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE,
        },
      });
    }
    const ehUser = buffer.slice(
      ehUserOffset,
      ehUserOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE
    );

    const chunksOffset =
      ehUserOffset + ZKIM_ENCRYPTION_CONSTANTS.EH_HEADER_SIZE;
    const chunks: Array<{
      nonce: Uint8Array;
      ciphertext: Uint8Array;
      tag: Uint8Array;
    }> = [];

    const signatureOffset =
      buffer.length - ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE;
    const merkleRootOffset =
      signatureOffset - ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE;

    if (merkleRootOffset < chunksOffset) {
      throw new ServiceError(
        "Invalid file structure: MERKLE_ROOT before chunks",
        {
          code: "INVALID_FILE_STRUCTURE",
          details: {
            merkleRootOffset,
            chunksOffset,
          },
        }
      );
    }

    const MAX_CHUNK_SIZE_MB = 4;
    const MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_MB * 1024 * 1024;

    let chunkOffset = chunksOffset;
    while (chunkOffset < merkleRootOffset) {
      if (
        chunkOffset + ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE >
        merkleRootOffset
      ) {
        break;
      }
      const nonce = buffer.slice(
        chunkOffset,
        chunkOffset + ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE
      );
      chunkOffset += ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE;

      const remainingBytes = merkleRootOffset - chunkOffset;
      if (remainingBytes < ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE) {
        break;
      }

      const estimatedCiphertextSize =
        remainingBytes - ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;
      const ciphertextSize = Math.min(estimatedCiphertextSize, MAX_CHUNK_SIZE);

      if (
        chunkOffset + ciphertextSize + ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE >
        merkleRootOffset
      ) {
        break;
      }

      const ciphertext = buffer.slice(
        chunkOffset,
        chunkOffset + ciphertextSize
      );
      chunkOffset += ciphertextSize;

      const tag = buffer.slice(
        chunkOffset,
        chunkOffset + ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE
      );
      chunkOffset += ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;

      chunks.push({ nonce, ciphertext, tag });
    }

    // Parse MERKLE_ROOT (MERKLE_ROOT_SIZE bytes)
    const merkleRoot = buffer.slice(
      merkleRootOffset,
      merkleRootOffset + ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE
    );

    // Parse SIGNATURE (SIGNATURE_SIZE bytes)
    const signature = buffer.slice(
      signatureOffset,
      signatureOffset + ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE
    );

    logger.debug("Wire format parsed successfully", {
      magic,
      version,
      flags,
      chunksCount: chunks.length,
      merkleRootLength: merkleRoot.length,
      signatureLength: signature.length,
    });

    return {
      magic,
      version,
      flags,
      kemCipherText,
      ehPlatform,
      ehUser,
      chunks,
      merkleRoot,
      signature,
    };
  } catch (error) {
    logger.error("Failed to parse wire format", error);
    throw error;
  }
}

/**
 * Convert wire format structure to ZkimFile
 * Requires decrypting EH_USER header to get file metadata and chunk info
 */
export async function convertWireFormatToZkimFile(
  wireFormat: {
    magic: string;
    version: number;
    flags: number;
    kemCipherText: Uint8Array;
    ehPlatform: Uint8Array;
    ehUser: Uint8Array;
    chunks: Array<{
      nonce: Uint8Array;
      ciphertext: Uint8Array;
      tag: Uint8Array;
    }>;
    merkleRoot: Uint8Array;
    signature: Uint8Array;
  },
  userKey: Uint8Array,
  platformKey: Uint8Array,
  encryptionService: IEncryptionService,
  logger: ILogger = defaultLogger,
  kemSecretKey?: Uint8Array
): Promise<ZkimFile> {
  const context = ErrorUtils.createContext(
    "WireFormat",
    "convertWireFormatToZkimFile",
    {
      severity: "high",
    }
  );

  const result = await ErrorUtils.withErrorHandling(async () => {
    await sodium.ready;

    // Decapsulate shared secret from KEM ciphertext if secret key provided (post-quantum)
    let derivedPlatformKey = platformKey;
    let derivedUserKey = userKey;
    
    if (kemSecretKey) {
      // Decapsulate shared secret using ML-KEM-768
      const { ml_kem768 } = await import("@noble/post-quantum/ml-kem.js");
      const sharedSecret = ml_kem768.decapsulate(wireFormat.kemCipherText, kemSecretKey);
      
      // Derive platform and user keys from ML-KEM-768 shared secret
      // Platform key includes platformKey parameter for tenant isolation
      const platformKeySeed = new Uint8Array([...sharedSecret, ...platformKey]);
      derivedPlatformKey = blake3(platformKeySeed, { dkLen: 32 });
      const userKeySeed = new Uint8Array([...sharedSecret, ...userKey]);
      derivedUserKey = blake3(userKeySeed, { dkLen: 32 });
      
      // Securely clear shared secret from memory
      sharedSecret.fill(0);
    }

    // Decrypt EH_USER header to get file metadata
    const ehUserParsed = parseEhHeader(wireFormat.ehUser);
    const userEncrypted = new Uint8Array(
      ehUserParsed.ciphertext.length + ehUserParsed.tag.length
    );
    userEncrypted.set(ehUserParsed.ciphertext, 0);
    userEncrypted.set(ehUserParsed.tag, ehUserParsed.ciphertext.length);

    // Decrypt user layer to get content key and metadata
    const userDecrypted = await encryptionService.decryptUserLayer(
      userEncrypted,
      derivedUserKey,
      ehUserParsed.nonce
    );

    // Decrypt EH_PLATFORM header to get search metadata (optional)
    const ehPlatformParsed = parseEhHeader(wireFormat.ehPlatform);
    const platformEncrypted = new Uint8Array(
      ehPlatformParsed.ciphertext.length + ehPlatformParsed.tag.length
    );
    platformEncrypted.set(ehPlatformParsed.ciphertext, 0);
    platformEncrypted.set(
      ehPlatformParsed.tag,
      ehPlatformParsed.ciphertext.length
    );

    // Platform layer is optional for decryption - validate but don't store
    try {
      await encryptionService.decryptPlatformLayer(
        platformEncrypted,
        derivedPlatformKey,
        ehPlatformParsed.nonce
      );
      // Platform layer decrypted successfully (not stored)
    } catch (error) {
      logger.warn("Failed to decrypt platform layer (optional)", { error });
      // Platform layer is optional for decryption
    }

    // Reconstruct chunks from wire format
    const zkimChunks: ZkimFileChunk[] = [];
    for (let i = 0; i < wireFormat.chunks.length; i++) {
      const wireChunk = wireFormat.chunks[i];
      if (!wireChunk) {
        continue;
      }

      // Reconstruct encrypted data (ciphertext + tag)
      const encryptedData = new Uint8Array(
        wireChunk.ciphertext.length + wireChunk.tag.length
      );
      encryptedData.set(wireChunk.ciphertext, 0);
      encryptedData.set(wireChunk.tag, wireChunk.ciphertext.length);

      // Calculate integrity hash from ciphertext (before encryption)
      // For wire format, we use the chunk's nonce + ciphertext for integrity
      const integrityHash = blake3(
        new Uint8Array([...wireChunk.nonce, ...wireChunk.ciphertext]),
        { dkLen: 32 }
      );

      zkimChunks.push({
        chunkIndex: i,
        chunkSize: wireChunk.ciphertext.length, // Original size before encryption
        compressedSize: wireChunk.ciphertext.length,
        encryptedSize: encryptedData.length,
        nonce: wireChunk.nonce,
        encryptedData,
        integrityHash,
        padding: new Uint8Array(0),
      });
    }

    // Reconstruct header from decrypted metadata
    const header: ZkimFileHeader = {
      magic: wireFormat.magic as "ZKIM",
      version: wireFormat.version,
      flags: wireFormat.flags,
      platformKeyId: "default",
      userId: userDecrypted.fileId ?? "unknown", // Use fileId as userId for now
      fileId: userDecrypted.fileId,
      createdAt: Date.now(), // Will be in metadata
      chunkCount: wireFormat.chunks.length,
      totalSize: zkimChunks.reduce((sum, chunk) => sum + chunk.chunkSize, 0),
      compressionType: 0, // Will be in metadata
      encryptionType: 1, // XChaCha20-Poly1305
      hashType: 1, // BLAKE3
      signatureType: 1, // ML-DSA-65 (FIPS 204)
    };

    // Reconstruct metadata
    await sodium.ready;
    const metadata: ZkimFileMetadata = {
      fileName: (userDecrypted.metadata?.fileName as string) ?? "unknown",
      mimeType:
        (userDecrypted.metadata?.mimeType as string) ??
        "application/octet-stream",
      tags: (userDecrypted.metadata?.tags as string[]) ?? [],
      customFields: {
        ...userDecrypted.metadata,
        encryptionType: "3-layer-zkim",
        userEncrypted: sodium.to_base64(userEncrypted),
        userNonce: sodium.to_base64(ehUserParsed.nonce),
        platformEncrypted: sodium.to_base64(platformEncrypted),
        platformNonce: sodium.to_base64(ehPlatformParsed.nonce),
        // Content key is NOT stored in metadata for security
        // It must be retrieved by decrypting the user layer
      },
      createdAt: Date.now(),
    };

    return {
      header,
      chunks: zkimChunks,
      metadata,
      platformSignature: new Uint8Array(
        ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE
      ), // Wire format signature is separate
      userSignature: new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.SIGNATURE_SIZE),
      contentSignature: wireFormat.signature.slice(
        0,
        ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE
      ), // Use wire format signature (first MERKLE_ROOT_SIZE bytes)
    };
  }, context);

  if (!result.success) {
    throw new ServiceError(
      `Failed to convert wire format to ZkimFile: ${result.error}`,
      {
        code: "WIRE_FORMAT_CONVERSION_FAILED",
        details: { error: result.error },
      }
    );
  }

  if (!result.data) {
    throw new ServiceError("Wire format conversion result data is undefined", {
      code: "WIRE_FORMAT_CONVERSION_DATA_MISSING",
    });
  }

  return result.data;
}

/**
 * Parse ZKIM file from bytes (wire format only)
 */
export async function parseZkimFile(
  data: Uint8Array,
  userKey: Uint8Array,
  platformKey: Uint8Array,
  encryptionService: IEncryptionService,
  logger: ILogger = defaultLogger,
  kemSecretKey?: Uint8Array
): Promise<ZkimFile> {
  const context = ErrorUtils.createContext("WireFormat", "parseZkimFile", {
    severity: "high",
  });

  const result = await ErrorUtils.withErrorHandling(async () => {
    // Verify wire format magic bytes
    if (data.length < ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE) {
      throw new ServiceError("ZKIM file too short to contain magic bytes", {
        code: "INVALID_FILE_SIZE",
        details: {
          dataLength: data.length,
          minLength: ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE,
        },
      });
    }

    const magicBytes = data.slice(
      0,
      ZKIM_ENCRYPTION_CONSTANTS.MAGIC_BYTES_SIZE
    );
    const magic = new TextDecoder().decode(magicBytes);

    if (magic !== "ZKIM") {
      throw new ServiceError("Invalid ZKIM file: missing wire format magic bytes", {
        code: "INVALID_WIRE_FORMAT",
        details: {
          expectedMagic: "ZKIM",
          actualMagic: magic,
        },
      });
    }

    // Wire format detected
    logger.debug("Detected wire format, parsing binary structure");

    const wireFormat = parseWireFormat(data, logger);
    return await convertWireFormatToZkimFile(
      wireFormat,
      userKey,
      platformKey,
      encryptionService,
      logger,
      kemSecretKey
    );
  }, context);

  if (!result.success) {
    throw new ServiceError(`Failed to parse ZKIM file: ${result.error}`, {
      code: "ZKIM_FILE_PARSE_FAILED",
      details: { error: result.error },
    });
  }

  if (!result.data) {
    throw new ServiceError("ZKIM file parse result data is undefined", {
      code: "ZKIM_FILE_PARSE_DATA_MISSING",
    });
  }

  return result.data;
}

