/**
 * ZkimEncryption Configuration Toggle Error Tests
 * Configuration toggle paths and feature flags
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

describe("ZkimEncryption - Configuration Toggle Tests", () => {
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

  describe("Configuration toggle paths", () => {
    it("should skip compression when compressionEnabled is false in compressData", async () => {
      // This tests the branch at line 504-506
      const encryptionNoCompression = new ZkimEncryption(
        { compressionEnabled: false },
        defaultLogger
      );
      await encryptionNoCompression.initialize();

      const result = await encryptionNoCompression.compressData(
        TEST_CONTENT_SMALL
      );

      expect(result).toBeDefined();
      expect(result.compressedData).toEqual(TEST_CONTENT_SMALL);
      expect(result.compressionRatio).toBe(1);

      await encryptionNoCompression.cleanup();
    });

    it("should skip decompression when compressionEnabled is false in decompressData", async () => {
      // This tests the branch at line 611-613
      const encryptionNoCompression = new ZkimEncryption(
        { compressionEnabled: false },
        defaultLogger
      );
      await encryptionNoCompression.initialize();

      const result = await encryptionNoCompression.decompressData(
        TEST_CONTENT_SMALL,
        TEST_CONTENT_SMALL.length
      );

      expect(result).toEqual(TEST_CONTENT_SMALL);

      await encryptionNoCompression.cleanup();
    });

    it("should throw error when key rotation is disabled", async () => {
      // This tests the branch at line 766-771
      // Note: The error gets wrapped by ErrorUtils, so we check for KEY_ROTATION_FAILED
      // but verify the original error message contains "Key rotation is disabled"
      const encryptionNoRotation = new ZkimEncryption(
        { enableKeyRotation: false },
        defaultLogger
      );
      await encryptionNoRotation.initialize();

      // First encrypt data to create a file with a key
      await encryptionNoRotation.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      await expect(
        encryptionNoRotation.rotateKeys(fileId)
      ).rejects.toThrow(ServiceError);

      const error = await encryptionNoRotation
        .rotateKeys(fileId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      // Error is wrapped by ErrorUtils, so code is KEY_ROTATION_FAILED
      expect(error.code).toBe("KEY_ROTATION_FAILED");
      // But the original error message should contain "Key rotation is disabled"
      expect(String(error.message)).toContain("Key rotation is disabled");

      await encryptionNoRotation.cleanup();
    });

    it("should return false when compromise detection is disabled", async () => {
      // This tests the branch at line 820-822
      const encryptionNoCompromiseDetection = new ZkimEncryption(
        { enableCompromiseDetection: false },
        defaultLogger
      );
      await encryptionNoCompromiseDetection.initialize();

      const result = await encryptionNoCompromiseDetection.checkKeyCompromise(
        fileId
      );

      expect(result).toBe(false);

      await encryptionNoCompromiseDetection.cleanup();
    });
  });
});

