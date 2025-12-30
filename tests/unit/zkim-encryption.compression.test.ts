/**
 * ZkimEncryption Compression Tests
 * Tests for compressData and decompressData
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import {
  TEST_CONTENT_SMALL,
  TEST_CONTENT_MEDIUM,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

describe("ZkimEncryption - Compression", () => {
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

  describe("compressData", () => {
    it("should compress data when compression is enabled", async () => {
      // Create encryption instance with compression enabled
      const encryptionWithCompression = new ZkimEncryption(
        {
          compressionEnabled: true,
          compressionAlgorithm: "gzip",
          compressionLevel: 6,
        },
        defaultLogger
      );
      await encryptionWithCompression.initialize();

      const result = await encryptionWithCompression.compressData(
        TEST_CONTENT_MEDIUM
      );

      expect(result).toBeDefined();
      expect(result.compressedData).toBeInstanceOf(Uint8Array);
      expect(result.originalSize).toBe(TEST_CONTENT_MEDIUM.length);
      expect(result.compressedSize).toBe(result.compressedData.length);

      await encryptionWithCompression.cleanup();
    });

    it("should not compress when compression is disabled", async () => {
      // Create encryption instance with compression disabled
      const encryptionWithoutCompression = new ZkimEncryption(
        {
          compressionEnabled: false,
          compressionAlgorithm: "gzip",
          compressionLevel: 6,
        },
        defaultLogger
      );
      await encryptionWithoutCompression.initialize();

      const result = await encryptionWithoutCompression.compressData(
        TEST_CONTENT_SMALL
      );

      expect(result).toBeDefined();
      expect(result.compressedData).toEqual(TEST_CONTENT_SMALL);
      expect(result.compressionRatio).toBe(1);

      await encryptionWithoutCompression.cleanup();
    });

    it("should handle empty data", async () => {
      const emptyData = new Uint8Array(0);
      const result = await encryption.compressData(emptyData);

      expect(result).toBeDefined();
      expect(result.compressedData).toBeInstanceOf(Uint8Array);
    });
  });

  describe("decompressData", () => {
    it("should decompress data correctly", async () => {
      // Create encryption instance with compression enabled
      const encryptionWithCompression = new ZkimEncryption(
        {
          compressionEnabled: true,
          compressionAlgorithm: "gzip",
          compressionLevel: 6,
        },
        defaultLogger
      );
      await encryptionWithCompression.initialize();

      const compressed = await encryptionWithCompression.compressData(
        TEST_CONTENT_SMALL
      );

      const decompressed = await encryptionWithCompression.decompressData(
        compressed.compressedData,
        compressed.originalSize
      );

      expect(decompressed).toEqual(TEST_CONTENT_SMALL);

      await encryptionWithCompression.cleanup();
    });

    it("should handle decompression error gracefully", async () => {
      const corruptedData = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

      await expect(
        encryption.decompressData(corruptedData, 100)
      ).rejects.toThrow();
    });
  });
});
