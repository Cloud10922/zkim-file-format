/**
 * ZkimEncryption Encryption/Decryption Tests
 * Tests for encryptData, decrypt, decryptUserLayer, decryptPlatformLayer, decryptChunk
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import { ServiceError } from "../../src/types/errors";
import {
  TEST_CONTENT_SMALL,
  TEST_CONTENT_LARGE,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

describe("ZkimEncryption - Encryption/Decryption", () => {
  let encryption: ZkimEncryption;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;
  let fileId: string;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    encryption = new ZkimEncryption(undefined, defaultLogger);
    await encryption.initialize();
    platformKey = new Uint8Array(TEST_PLATFORM_KEY);
    userKey = new Uint8Array(TEST_USER_KEY);
    fileId = TEST_FILE_ID;
  });

  afterEach(async () => {
    await encryption.cleanup();
  });

  describe("encryptData", () => {
    it("should encrypt data with three-layer encryption", async () => {
      const result = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      expect(result).toBeDefined();
      expect(result.platformEncrypted).toBeInstanceOf(Uint8Array);
      expect(result.userEncrypted).toBeInstanceOf(Uint8Array);
      expect(result.contentEncrypted).toBeInstanceOf(Uint8Array);
      expect(result.nonces).toBeInstanceOf(Array);
      expect(result.nonces.length).toBe(3);
      expect(result.contentKey).toBeInstanceOf(Uint8Array);
    });

    it("should produce different ciphertexts for same plaintext", async () => {
      const fileId1 = "test-file-1";
      const fileId2 = "test-file-2";
      const result1 = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId1
      );
      const result2 = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId2
      );

      // Nonces should be different (random or derived)
      expect(result1.nonces[0]).not.toEqual(result2.nonces[0]);
      expect(result1.nonces[1]).not.toEqual(result2.nonces[1]);
      expect(result1.nonces[2]).not.toEqual(result2.nonces[2]);

      // Ciphertexts should be different due to different nonces/content keys
      expect(result1.platformEncrypted).not.toEqual(result2.platformEncrypted);
      expect(result1.userEncrypted).not.toEqual(result2.userEncrypted);
      expect(result1.contentEncrypted).not.toEqual(result2.contentEncrypted);
    });

    it("should generate unique nonces for each layer", async () => {
      const result = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      // All three nonces should be different
      expect(result.nonces[0]).not.toEqual(result.nonces[1]);
      expect(result.nonces[1]).not.toEqual(result.nonces[2]);
      expect(result.nonces[0]).not.toEqual(result.nonces[2]);
    });

    it("should generate unique content keys for each file", async () => {
      const result1 = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        "file-1"
      );
      const result2 = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        "file-2"
      );

      expect(result1.contentKey).not.toEqual(result2.contentKey);
    });

    it("should handle empty data", async () => {
      const emptyData = new Uint8Array(0);
      const result = await encryption.encryptData(
        emptyData,
        platformKey,
        userKey,
        fileId
      );

      expect(result).toBeDefined();
      expect(result.contentEncrypted).toBeInstanceOf(Uint8Array);
    });

    it("should handle large data", async () => {
      const result = await encryption.encryptData(
        TEST_CONTENT_LARGE,
        platformKey,
        userKey,
        fileId
      );

      expect(result).toBeDefined();
      expect(result.contentEncrypted.length).toBeGreaterThan(0);
    });
  });

  describe("decrypt", () => {
    it("should decrypt data correctly", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const decrypted = await encryption.decrypt(
        encrypted.contentEncrypted,
        encrypted.contentKey,
        encrypted.nonces[2]
      );

      expect(decrypted).toEqual(TEST_CONTENT_SMALL);
    });

    it("should fail to decrypt with wrong key", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const wrongKey = sodium.randombytes_buf(32);
      await expect(
        encryption.decrypt(
          encrypted.contentEncrypted,
          wrongKey,
          encrypted.nonces[2]
        )
      ).rejects.toThrow();
    });

    it("should fail with wrong nonce", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const wrongNonce = sodium.randombytes_buf(24);
      await expect(
        encryption.decrypt(
          encrypted.contentEncrypted,
          encrypted.contentKey,
          wrongNonce
        )
      ).rejects.toThrow();
    });

    it("should fail with corrupted data", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      // Corrupt the encrypted data
      const corrupted = new Uint8Array(encrypted.contentEncrypted);
      corrupted[0] = corrupted[0] ^ 0xff;

      await expect(
        encryption.decrypt(corrupted, encrypted.contentKey, encrypted.nonces[2])
      ).rejects.toThrow();
    });
  });

  describe("decryptUserLayer", () => {
    it("should decrypt user layer correctly", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const decrypted = await encryption.decryptUserLayer(
        encrypted.userEncrypted,
        userKey,
        encrypted.nonces[1]
      );

      expect(decrypted).toBeDefined();
      expect(decrypted.contentKey).toBeDefined();
      expect(decrypted.fileId).toBe(fileId);
      expect(decrypted.metadata).toBeDefined();
    });

    it("should fail with wrong user key", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const wrongUserKey = sodium.randombytes_buf(32);
      await expect(
        encryption.decryptUserLayer(
          encrypted.userEncrypted,
          wrongUserKey,
          encrypted.nonces[1]
        )
      ).rejects.toThrow();
    });
  });

  describe("decryptPlatformLayer", () => {
    it("should decrypt platform layer correctly", async () => {
      const metadata = { test: "value" };
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId,
        metadata
      );

      const decrypted = await encryption.decryptPlatformLayer(
        encrypted.platformEncrypted,
        platformKey,
        encrypted.nonces[0]
      );

      expect(decrypted).toBeDefined();
      expect(typeof decrypted).toBe("object");
    });

    it("should fail with wrong platform key", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const wrongPlatformKey = sodium.randombytes_buf(32);
      await expect(
        encryption.decryptPlatformLayer(
          encrypted.platformEncrypted,
          wrongPlatformKey,
          encrypted.nonces[0]
        )
      ).rejects.toThrow();
    });
  });

  describe("decryptChunk", () => {
    it("should decrypt chunk correctly", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const chunk = {
        chunkIndex: 0,
        chunkSize: TEST_CONTENT_SMALL.length,
        compressedSize: TEST_CONTENT_SMALL.length,
        encryptedSize: encrypted.contentEncrypted.length,
        nonce: encrypted.nonces[2],
        encryptedData: encrypted.contentEncrypted,
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      const decrypted = await encryption.decryptChunk(chunk, userKey, fileId, 0);
      expect(decrypted).toEqual(TEST_CONTENT_SMALL);
    });

    it("should fail when content key not stored", async () => {
      const encrypted = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      const chunk = {
        chunkIndex: 0,
        chunkSize: TEST_CONTENT_SMALL.length,
        compressedSize: TEST_CONTENT_SMALL.length,
        encryptedSize: encrypted.contentEncrypted.length,
        nonce: encrypted.nonces[2],
        encryptedData: encrypted.contentEncrypted,
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      // Try to decrypt with a different fileId (content key not stored for this fileId)
      await expect(
        encryption.decryptChunk(chunk, userKey, "unknown-file-id", 0)
      ).rejects.toThrow();
    });
  });
});
