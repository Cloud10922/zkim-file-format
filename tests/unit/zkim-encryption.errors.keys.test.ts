/**
 * ZkimEncryption Key Management Error Tests
 * Error paths for generateSessionKey, rotateKeys, checkKeyCompromise
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import { ServiceError } from "../../src/types/errors";
import {
  TEST_CONTENT_SMALL,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

describe("ZkimEncryption - Key Management Errors", () => {
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

  describe("rotateKeys - error paths", () => {
    it("should handle key rotation when enableKeyRotation is false", async () => {
      const encryptionWithoutRotation = new ZkimEncryption(
        {
          enableKeyRotation: false,
        },
        defaultLogger
      );
      await encryptionWithoutRotation.initialize();

      // When key rotation is disabled, rotateKeys may still throw if file doesn't exist
      // First create a file to have a valid key
      await encryptionWithoutRotation.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId,
        {}
      );

      // Rotation should fail when disabled
      await expect(
        encryptionWithoutRotation.rotateKeys(fileId)
      ).rejects.toThrow(ServiceError);

      await encryptionWithoutRotation.cleanup();
    });

    it("should generate new key when rotating keys for any file ID", async () => {
      // rotateKeys doesn't check if file exists - it just generates a new key
      const newKey = await encryption.rotateKeys("non-existent-file-id");
      expect(newKey).toBeDefined();
      expect(newKey.length).toBe(32); // Key size
    });
  });

  describe("generateSessionKey - validation", () => {
    it("should throw error when ephemeral key is invalid length", async () => {
      const invalidKey = new Uint8Array(16); // Wrong length (should be 32)

      await expect(
        encryption.generateSessionKey("peer-id", invalidKey)
      ).rejects.toThrow(ServiceError);
    });

    it("should throw error when ephemeral key is null or undefined", async () => {
      // TypeScript won't allow null, but we can test with empty array
      const emptyKey = new Uint8Array(0);

      await expect(
        encryption.generateSessionKey("peer-id", emptyKey)
      ).rejects.toThrow(ServiceError);
    });

    it("should generate session key with valid ephemeral key", async () => {
      const validKey = sodium.randombytes_buf(32);

      const sessionKey = await encryption.generateSessionKey("peer-id", validKey);

      expect(sessionKey).toBeDefined();
      expect(sessionKey.length).toBeGreaterThan(0);
    });
  });
});

