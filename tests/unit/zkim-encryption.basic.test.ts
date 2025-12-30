/**
 * ZkimEncryption Basic Tests
 * Tests for constructor, initialization, and cleanup
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import {
  TEST_CONTENT_SMALL,
  TEST_CONTENT_MEDIUM,
  TEST_CONTENT_LARGE,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

describe("ZkimEncryption - Basic", () => {
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

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new ZkimEncryption(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimEncryption);
    });

    it("should create instance with custom config", () => {
      const customConfig = {
        enableThreeLayerEncryption: false,
        compressionEnabled: false,
        compressionLevel: 9,
      };
      const instance = new ZkimEncryption(customConfig, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimEncryption);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const instance = new ZkimEncryption(undefined, defaultLogger);
      await expect(instance.initialize()).resolves.not.toThrow();
      await instance.cleanup();
    });

    it("should not reinitialize if already initialized", async () => {
      await expect(encryption.initialize()).resolves.not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should cleanup resources", async () => {
      await expect(encryption.cleanup()).resolves.not.toThrow();
    });
  });
});
