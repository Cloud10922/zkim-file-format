/**
 * ZkimEncryption Key Management Tests
 * Tests for generateSessionKey, rotateKeys, checkKeyCompromise
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import {
  TEST_CONTENT_SMALL,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

describe("ZkimEncryption - Key Management", () => {
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

  describe("generateSessionKey", () => {
    it("should generate session key with valid ephemeral key", async () => {
      const validKey = sodium.randombytes_buf(32);

      const sessionKey = await encryption.generateSessionKey("peer-id", validKey);

      expect(sessionKey).toBeDefined();
      expect(sessionKey.length).toBeGreaterThan(0);
    });
  });

  describe("rotateKeys", () => {
    it("should generate new key when rotating keys for any file ID", async () => {
      // rotateKeys doesn't check if file exists - it just generates a new key
      const newKey = await encryption.rotateKeys("non-existent-file-id");
      expect(newKey).toBeDefined();
      expect(newKey.length).toBe(32); // Key size
    });
  });

  describe("checkKeyCompromise", () => {
    it("should return false for uncompromised key", async () => {
      const compromised = await encryption.checkKeyCompromise(fileId);
      expect(compromised).toBe(false);
    });

    it("should return false when enableCompromiseDetection is false", async () => {
      const encryptionWithoutDetection = new ZkimEncryption(
        {
          enableCompromiseDetection: false,
        },
        defaultLogger
      );
      await encryptionWithoutDetection.initialize();

      const result = await encryptionWithoutDetection.checkKeyCompromise(fileId);
      expect(result).toBe(false);

      await encryptionWithoutDetection.cleanup();
    });
  });
});
