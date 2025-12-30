/**
 * ZkimEncryption Branch Coverage Tests
 * Focused tests for missing branch coverage to reach 80%+ target
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { ServiceError } from "../../src/types/errors";
import { defaultLogger } from "../../src/utils/logger";
import { TEST_CONTENT_SMALL, TEST_FILE_ID } from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";
import type { ZkimFileChunk } from "../../src/types/zkim-file-format";
import sodium from "libsodium-wrappers-sumo";

describe("ZkimEncryption - Branch Coverage", () => {
  let encryption: ZkimEncryption;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;
  let fileId: string;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    encryption = new ZkimEncryption(undefined, defaultLogger);
    platformKey = new Uint8Array(TEST_PLATFORM_KEY);
    userKey = new Uint8Array(TEST_USER_KEY);
    fileId = TEST_FILE_ID;
  });

  afterEach(async () => {
    if (encryption) {
      await encryption.cleanup();
    }
  });

  describe("initialize - branch paths", () => {
    it("should return early when isReady is true (line 67-69)", async () => {
      const service = new ZkimEncryption(undefined, defaultLogger);
      await service.initialize();
      
      // Manually set initialized to test the early return branch
      (service as any).initialized = true;
      
      // Second call should return early
      await expect(service.initialize()).resolves.not.toThrow();
      
      // Verify service is still ready
      expect(service.isReady()).toBe(true);
      
      await service.cleanup();
    });
  });

  describe("encryptData - nonce validation branches", () => {
    it("should throw when nonces array is too short (line 152-160)", async () => {
      await encryption.initialize();

      // Mock generateNonces to return insufficient nonces
      const originalGenerateNonces = (encryption as any).generateNonces;
      (encryption as any).generateNonces = jest.fn((fileId: string, count: number) => {
        // Return only 2 nonces instead of 3
        return [
          sodium.randombytes_buf(24),
          sodium.randombytes_buf(24),
        ];
      });

      // The error is wrapped by ErrorUtils, so we check for ServiceError
      await expect(
        encryption.encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId)
      ).rejects.toThrow(ServiceError);
      
      // Verify the branch was hit by checking error message
      try {
        await encryption.encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        // The error should mention nonce generation
        expect(String(error)).toMatch(/nonce|NONCE/i);
      }

      // Restore
      (encryption as any).generateNonces = originalGenerateNonces;
    });

    it("should throw when platform nonce is undefined (line 163-167)", async () => {
      await encryption.initialize();

      // Mock generateNonces to return array with undefined first element
      const originalGenerateNonces = (encryption as any).generateNonces;
      (encryption as any).generateNonces = jest.fn((fileId: string, count: number) => {
        return [
          undefined, // Platform nonce is undefined
          sodium.randombytes_buf(24),
          sodium.randombytes_buf(24),
        ];
      });

      // The error is wrapped by ErrorUtils, so we check for ServiceError
      await expect(
        encryption.encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId)
      ).rejects.toThrow(ServiceError);
      
      // Verify the branch was hit
      try {
        await encryption.encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        // The error should mention platform nonce
        expect(String(error)).toMatch(/platform|PLATFORM/i);
      }

      // Restore
      (encryption as any).generateNonces = originalGenerateNonces;
    });

    it("should throw when user nonce is undefined (line 186-190)", async () => {
      await encryption.initialize();

      // Mock generateNonces to return array with undefined second element
      const originalGenerateNonces = (encryption as any).generateNonces;
      (encryption as any).generateNonces = jest.fn((fileId: string, count: number) => {
        return [
          sodium.randombytes_buf(24),
          undefined, // User nonce is undefined
          sodium.randombytes_buf(24),
        ];
      });

      // The error is wrapped by ErrorUtils, so we check for ServiceError
      await expect(
        encryption.encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId)
      ).rejects.toThrow(ServiceError);
      
      // Verify the branch was hit
      try {
        await encryption.encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        // The error should mention user nonce
        expect(String(error)).toMatch(/user|USER/i);
      }

      // Restore
      (encryption as any).generateNonces = originalGenerateNonces;
    });
  });

  describe("decryptChunk - userKey validation branch", () => {
    it("should throw when userKey is empty (line 287-292)", async () => {
      await encryption.initialize();

      // First encrypt some data to populate keyStore
      const encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      // Create a chunk
      const chunk: ZkimFileChunk = {
        chunkIndex: 0,
        chunkSize: TEST_CONTENT_SMALL.length,
        encryptedData: encryptResult.contentEncrypted,
        nonce: encryptResult.nonces[2]!,
        hash: new Uint8Array(32),
      };

      // Try to decrypt with empty userKey
      // The userKey validation happens after contentKey is retrieved
      const emptyKey = new Uint8Array(0);

      // The error is wrapped by ErrorUtils, so we check for ServiceError
      await expect(
        encryption.decryptChunk(chunk, emptyKey, fileId, 0)
      ).rejects.toThrow(ServiceError);
      
      // The actual error code might be wrapped, so we just verify it throws
      try {
        await encryption.decryptChunk(chunk, emptyKey, fileId, 0);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        // The error should indicate userKey is required
        expect(String(error)).toContain("User key");
      }
    });
  });

  describe("decompressData - switch case branches", () => {
    it("should handle brotli decompression (line 620-622)", async () => {
      await encryption.initialize();

      // Compress data first
      const compressed = await encryption.compressData(TEST_CONTENT_SMALL, {
        compressionAlgorithm: "brotli",
        compressionEnabled: true,
      });

      // Decompress using brotli - use public method with correct signature
      const decompressed = await encryption.decompressData(
        compressed.compressedData,
        compressed.originalSize,
        {
          compressionAlgorithm: "brotli",
        }
      );

      expect(decompressed).toBeDefined();
      expect(decompressed.length).toBe(compressed.originalSize);
    });

    it("should handle gzip decompression (line 623-625)", async () => {
      await encryption.initialize();

      // Compress data first
      const compressed = await encryption.compressData(TEST_CONTENT_SMALL, {
        compressionAlgorithm: "gzip",
        compressionEnabled: true,
      });

      // Decompress using gzip - use public method with correct signature
      const decompressed = await encryption.decompressData(
        compressed.compressedData,
        compressed.originalSize,
        {
          compressionAlgorithm: "gzip",
        }
      );

      expect(decompressed).toBeDefined();
      expect(decompressed.length).toBe(compressed.originalSize);
    });

    it("should throw when compression algorithm is unsupported (line 626-635)", async () => {
      await encryption.initialize();

      // Compress data first
      const compressed = await encryption.compressData(TEST_CONTENT_SMALL, {
        compressionAlgorithm: "gzip",
        compressionEnabled: true,
      });

      // Try to decompress with unsupported algorithm
      await expect(
        encryption.decompressData(
          compressed.compressedData,
          compressed.originalSize,
          {
            compressionAlgorithm: "unsupported" as any,
          }
        )
      ).rejects.toThrow(ServiceError);
    });
  });

  describe("extractSearchableText - error handling branch", () => {
    it("should return empty string when text extraction fails (line 880-887)", async () => {
      await encryption.initialize();

      // Create invalid data that will fail TextDecoder.decode
      // Use binary data that's not valid UTF-8
      const invalidTextData = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]);

      const searchableText = (encryption as any).extractSearchableText(invalidTextData);

      // Should return empty string when extraction fails
      expect(searchableText).toBe("");
    });
  });
});

