/**
 * ZKIM Encryption Tests
 * Comprehensive tests for encryption service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import { ServiceError } from "../../src/types/errors";
import type { ZkimFileChunk } from "../../src/types/zkim-file-format";

describe("ZkimEncryption", () => {
  let encryption: ZkimEncryption;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;
  const TEST_FILE_ID = "test-file-id";

  beforeAll(async () => {
    await sodium.ready;
    platformKey = sodium.randombytes_buf(32);
    userKey = sodium.randombytes_buf(32);
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    encryption = new ZkimEncryption(undefined, defaultLogger);
    await encryption.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (encryption) {
      await encryption.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new ZkimEncryption(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimEncryption);
    });

    it("should create instance with custom config", () => {
      const instance = new ZkimEncryption(
        {
          enableThreeLayerEncryption: false,
          compressionEnabled: false,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(ZkimEncryption);
    });
  });

  describe("encryptData", () => {
    it("should encrypt data with three-layer encryption", async () => {
      const data = new TextEncoder().encode("test data");
      const result = await encryption.encryptData(
        data,
        platformKey,
        userKey,
        TEST_FILE_ID
      );

      expect(result).toHaveProperty("platformEncrypted");
      expect(result).toHaveProperty("userEncrypted");
      expect(result).toHaveProperty("contentEncrypted");
      expect(result).toHaveProperty("contentKey");
      expect(result).toHaveProperty("nonces");
      expect(result.nonces.length).toBe(3);
      expect(result.platformEncrypted).toBeInstanceOf(Uint8Array);
      expect(result.userEncrypted).toBeInstanceOf(Uint8Array);
      expect(result.contentEncrypted).toBeInstanceOf(Uint8Array);
    });

    it("should encrypt data with metadata", async () => {
      const data = new TextEncoder().encode("test data");
      const metadata = { fileName: "test.txt", mimeType: "text/plain" };
      const result = await encryption.encryptData(
        data,
        platformKey,
        userKey,
        TEST_FILE_ID,
        metadata
      );

      expect(result).toHaveProperty("contentKey");
      expect(result.contentKey).toBeInstanceOf(Uint8Array);
    });
  });

  describe("decryptChunk", () => {
    it("should decrypt chunk data", async () => {
      const data = new TextEncoder().encode("test chunk data");
      const encryptResult = await encryption.encryptData(
        data,
        platformKey,
        userKey,
        TEST_FILE_ID
      );

      const chunk: ZkimFileChunk = {
        chunkIndex: 0,
        chunkSize: data.length,
        compressedSize: data.length,
        encryptedSize: encryptResult.contentEncrypted.length,
        nonce: encryptResult.nonces[2]!,
        encryptedData: encryptResult.contentEncrypted,
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      const decrypted = await encryption.decryptChunk(
        chunk,
        userKey,
        TEST_FILE_ID,
        0
      );

      expect(decrypted).toEqual(data);
    });

    it("should throw error when content key not found", async () => {
      const chunk: ZkimFileChunk = {
        chunkIndex: 0,
        chunkSize: 10,
        compressedSize: 10,
        encryptedSize: 10,
        nonce: new Uint8Array(24),
        encryptedData: new Uint8Array(10),
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      await expect(
        encryption.decryptChunk(chunk, userKey, "non-existent-file", 0)
      ).rejects.toThrow(ServiceError);
    });
  });

  describe("decrypt", () => {
    it("should decrypt encrypted data", async () => {
      const data = new TextEncoder().encode("test data to decrypt");
      const encryptResult = await encryption.encryptData(
        data,
        platformKey,
        userKey,
        TEST_FILE_ID
      );

      // decrypt uses contentKey, not userKey
      const decrypted = await encryption.decrypt(
        encryptResult.contentEncrypted,
        encryptResult.contentKey,
        encryptResult.nonces[2]!
      );

      expect(decrypted).toEqual(data);
    });
  });

  describe("compressData / decompressData", () => {
    it("should compress and decompress data", async () => {
      const data = new TextEncoder().encode("test data to compress".repeat(100));
      const compressed = await encryption.compressData(data);
      expect(compressed).toHaveProperty("compressedData");
      expect(compressed).toHaveProperty("originalSize");
      expect(compressed).toHaveProperty("compressedSize");
      expect(compressed.compressedSize).toBeLessThanOrEqual(compressed.originalSize);

      const decompressed = await encryption.decompressData(
        compressed.compressedData,
        compressed.originalSize
      );
      expect(decompressed).toEqual(data);
    });

    it("should handle compression disabled", async () => {
      const encryptionNoCompress = new ZkimEncryption(
        { compressionEnabled: false },
        defaultLogger
      );
      await encryptionNoCompress.initialize();

      const data = new TextEncoder().encode("test data");
      const result = await encryptionNoCompress.compressData(data);
      expect(result.compressedData).toEqual(data);
      expect(result.compressedSize).toBe(data.length);

      await encryptionNoCompress.cleanup();
    });
  });

  describe("generateSessionKey", () => {
    it("should generate session key", async () => {
      const peerId = "test-peer-id";
      const ephemeralKey = sodium.randombytes_buf(32);
      const sessionKey = await encryption.generateSessionKey(peerId, ephemeralKey);
      expect(sessionKey).toBeInstanceOf(Uint8Array);
      expect(sessionKey.length).toBe(32);
    });
  });

  describe("rotateKeys", () => {
    it("should rotate keys for file", async () => {
      // First encrypt data to create keys
      const data = new TextEncoder().encode("test data");
      await encryption.encryptData(data, platformKey, userKey, TEST_FILE_ID);

      const newKey = await encryption.rotateKeys(TEST_FILE_ID);
      expect(newKey).toBeInstanceOf(Uint8Array);
      expect(newKey.length).toBe(32);
    });

    it("should throw error when key rotation is disabled", async () => {
      const encryptionNoRotation = new ZkimEncryption(
        { enableKeyRotation: false },
        defaultLogger
      );
      await encryptionNoRotation.initialize();

      await expect(
        encryptionNoRotation.rotateKeys(TEST_FILE_ID)
      ).rejects.toThrow(ServiceError);

      await encryptionNoRotation.cleanup();
    });
  });

  describe("checkKeyCompromise", () => {
    it("should check for key compromise", async () => {
      const data = new TextEncoder().encode("test data");
      await encryption.encryptData(data, platformKey, userKey, TEST_FILE_ID);

      const isCompromised = await encryption.checkKeyCompromise(TEST_FILE_ID);
      expect(typeof isCompromised).toBe("boolean");
    });

    it("should return false when compromise detection is disabled", async () => {
      const encryptionNoDetection = new ZkimEncryption(
        { enableCompromiseDetection: false },
        defaultLogger
      );
      await encryptionNoDetection.initialize();

      const isCompromised = await encryptionNoDetection.checkKeyCompromise(TEST_FILE_ID);
      expect(isCompromised).toBe(false);

      await encryptionNoDetection.cleanup();
    });
  });

  describe("decryptUserLayer", () => {
    it("should decrypt user layer", async () => {
      const data = new TextEncoder().encode("test data");
      const encryptResult = await encryption.encryptData(
        data,
        platformKey,
        userKey,
        TEST_FILE_ID
      );

      const result = await encryption.decryptUserLayer(
        encryptResult.userEncrypted,
        userKey,
        encryptResult.nonces[1]!
      );

      expect(result).toHaveProperty("fileId");
      expect(result).toHaveProperty("contentKey");
      expect(result).toHaveProperty("metadata");
      expect(result.fileId).toBe(TEST_FILE_ID);
      expect(result.contentKey).toBeInstanceOf(Uint8Array);
    });
  });

  describe("decryptPlatformLayer", () => {
    it("should decrypt platform layer", async () => {
      const data = new TextEncoder().encode("test data");
      const encryptResult = await encryption.encryptData(
        data,
        platformKey,
        userKey,
        TEST_FILE_ID
      );

      const result = await encryption.decryptPlatformLayer(
        encryptResult.platformEncrypted,
        platformKey,
        encryptResult.nonces[0]!
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("decompressData", () => {
    it("should decompress data", async () => {
      const data = new TextEncoder().encode("test data to compress".repeat(100));
      const compressed = await encryption.compressData(data);
      
      const decompressed = await encryption.decompressData(
        compressed.compressedData,
        compressed.originalSize
      );
      
      expect(decompressed).toEqual(data);
    });

    it("should handle decompression when compression disabled", async () => {
      const encryptionNoCompress = new ZkimEncryption(
        { compressionEnabled: false },
        defaultLogger
      );
      await encryptionNoCompress.initialize();

      const data = new TextEncoder().encode("test data");
      const decompressed = await encryptionNoCompress.decompressData(data, data.length);
      expect(decompressed).toEqual(data);

      await encryptionNoCompress.cleanup();
    });
  });
});

