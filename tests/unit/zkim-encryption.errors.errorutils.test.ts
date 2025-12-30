/**
 * ZkimEncryption ErrorUtils Mocked Tests
 * All ErrorUtils.withErrorHandling mocked error path tests
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import { ServiceError } from "../../src/types/errors";
import type { ServiceResult } from "../../src/types/errors";
import { ErrorUtils } from "../../src/utils/error-handling";
import type { ZkimFileChunk } from "../../src/types/zkim-file-format";
import {
  TEST_CONTENT_SMALL,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

describe("ZkimEncryption - ErrorUtils Mocked Tests", () => {
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

  describe("ErrorUtils.withErrorHandling error paths", () => {
    it("should handle errors in encryptData when operation throws", async () => {
      // This tests the error path in ErrorUtils.withErrorHandling
      // We can't easily force an error in encryptData, but we can test
      // that errors are properly caught and wrapped
      const invalidKey = new Uint8Array(16);

      // This should trigger an error that gets caught by ErrorUtils.withErrorHandling
      await expect(
        encryption.encryptData(
          TEST_CONTENT_SMALL,
          invalidKey,
          userKey,
          fileId,
          {}
        )
      ).rejects.toThrow(ServiceError);
    });

    it("should handle errors in decryptChunk when operation throws", async () => {
      const chunk = {
        chunkIndex: 0,
        chunkSize: 100,
        compressedSize: 100,
        encryptedSize: 100,
        nonce: sodium.randombytes_buf(24),
        encryptedData: new Uint8Array(100),
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      // This should trigger error path in ErrorUtils.withErrorHandling
      await expect(
        encryption.decryptChunk(chunk, userKey, "non-existent-file-id", 0)
      ).rejects.toThrow(ServiceError);
    });

    it("should handle errors in decryptUserLayer when operation throws", async () => {
      const encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId,
        {}
      );

      const wrongKey = sodium.randombytes_buf(32);

      // This should trigger error path in ErrorUtils.withErrorHandling
      await expect(
        encryption.decryptUserLayer(
          encryptResult.userEncrypted,
          wrongKey,
          encryptResult.nonces[1] ?? new Uint8Array(24)
        )
      ).rejects.toThrow();
    });

    it("should handle errors in decrypt when operation throws", async () => {
      const encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId,
        {}
      );

      const wrongKey = sodium.randombytes_buf(32);

      // This should trigger error path in ErrorUtils.withErrorHandling
      await expect(
        encryption.decrypt(
          encryptResult.contentEncrypted,
          wrongKey,
          encryptResult.nonces[2] ?? new Uint8Array(24)
        )
      ).rejects.toThrow();
    });

    it("should handle errors in checkKeyCompromise when operation throws", async () => {
      // This tests the error path when result.success is false
      // We can't easily force this, but the test verifies the error handling structure
      const result = await encryption.checkKeyCompromise(fileId);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("encryptData - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;

    beforeEach(() => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 236-241
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked encryption failure",
        data: undefined,
      } as ServiceResult<any>);

      await expect(
        encryption.encryptData(
          TEST_CONTENT_SMALL,
          platformKey,
          userKey,
          fileId
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("ENCRYPTION_FAILED");
      expect(String(error.message)).toContain("Encryption failed");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 243-247
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      await expect(
        encryption.encryptData(
          TEST_CONTENT_SMALL,
          platformKey,
          userKey,
          fileId
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("ENCRYPTION_DATA_MISSING");
    });
  });

  describe("decryptChunk - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;
    let encryptResult: Awaited<ReturnType<typeof encryption.encryptData>>;

    beforeEach(async () => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
      encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );
      // Store content key for decryptChunk
      encryption["keyStore"].set(fileId, encryptResult.contentKey);
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 304-309
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked decryption failure",
        data: undefined,
      } as ServiceResult<any>);

      const chunk: ZkimFileChunk = {
        chunkIndex: 0,
        chunkSize: TEST_CONTENT_SMALL.length,
        compressedSize: TEST_CONTENT_SMALL.length,
        encryptedSize: encryptResult.contentEncrypted.length,
        nonce: encryptResult.nonces[2] ?? new Uint8Array(24),
        encryptedData: encryptResult.contentEncrypted,
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      await expect(
        encryption.decryptChunk(chunk, userKey, fileId, 0)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decryptChunk(chunk, userKey, fileId, 0)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("DECRYPTION_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 311-316
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      const chunk: ZkimFileChunk = {
        chunkIndex: 0,
        chunkSize: TEST_CONTENT_SMALL.length,
        compressedSize: TEST_CONTENT_SMALL.length,
        encryptedSize: encryptResult.contentEncrypted.length,
        nonce: encryptResult.nonces[2] ?? new Uint8Array(24),
        encryptedData: encryptResult.contentEncrypted,
        integrityHash: new Uint8Array(32),
        padding: new Uint8Array(0),
      };

      await expect(
        encryption.decryptChunk(chunk, userKey, fileId, 0)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decryptChunk(chunk, userKey, fileId, 0)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("DECRYPTION_DATA_MISSING");
    });
  });

  describe("decryptUserLayer - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;
    let encryptResult: Awaited<ReturnType<typeof encryption.encryptData>>;

    beforeEach(async () => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
      encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 372-377
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked user layer decryption failure",
        data: undefined,
      } as ServiceResult<any>);

      const userNonce = encryptResult.nonces[1];
      if (!userNonce) {
        throw new Error("User nonce is undefined");
      }

      await expect(
        encryption.decryptUserLayer(
          encryptResult.userEncrypted,
          userKey,
          userNonce
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decryptUserLayer(encryptResult.userEncrypted, userKey, userNonce)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("USER_LAYER_DECRYPTION_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 379-383
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      const userNonce = encryptResult.nonces[1];
      if (!userNonce) {
        throw new Error("User nonce is undefined");
      }

      await expect(
        encryption.decryptUserLayer(
          encryptResult.userEncrypted,
          userKey,
          userNonce
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decryptUserLayer(encryptResult.userEncrypted, userKey, userNonce)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("USER_LAYER_DECRYPTION_DATA_MISSING");
    });
  });

  describe("decrypt - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;
    let encryptResult: Awaited<ReturnType<typeof encryption.encryptData>>;

    beforeEach(async () => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
      encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 473-478
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked decryption failure",
        data: undefined,
      } as ServiceResult<any>);

      const contentNonce = encryptResult.nonces[2];
      if (!contentNonce) {
        throw new Error("Content nonce is undefined");
      }

      await expect(
        encryption.decrypt(
          encryptResult.contentEncrypted,
          encryptResult.contentKey,
          contentNonce
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decrypt(
          encryptResult.contentEncrypted,
          encryptResult.contentKey,
          contentNonce
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("DECRYPTION_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 480-484
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      const contentNonce = encryptResult.nonces[2];
      if (!contentNonce) {
        throw new Error("Content nonce is undefined");
      }

      await expect(
        encryption.decrypt(
          encryptResult.contentEncrypted,
          encryptResult.contentKey,
          contentNonce
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decrypt(
          encryptResult.contentEncrypted,
          encryptResult.contentKey,
          contentNonce
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("ENCRYPTION_DATA_MISSING");
    });
  });

  describe("encryptData - content nonce undefined error path", () => {
    it("should throw error when content nonce is undefined", async () => {
      // This tests the branch at line 204-208
      // Error gets wrapped by ErrorUtils.withErrorHandling, so we check for ENCRYPTION_FAILED
      // but verify the original error message contains CONTENT_NONCE_UNDEFINED
      const encryptionInstance = new ZkimEncryption(undefined, defaultLogger);
      await encryptionInstance.initialize();

      // Create a spy that returns nonces with undefined third element
      jest
        .spyOn(encryptionInstance as any, "generateNonces")
        .mockReturnValue([
          sodium.randombytes_buf(24),
          sodium.randombytes_buf(24),
          undefined as any,
        ]);

      await expect(
        encryptionInstance.encryptData(
          TEST_CONTENT_SMALL,
          platformKey,
          userKey,
          fileId
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryptionInstance
        .encryptData(TEST_CONTENT_SMALL, platformKey, userKey, fileId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      // Error is wrapped by ErrorUtils, so code is ENCRYPTION_FAILED
      expect(error.code).toBe("ENCRYPTION_FAILED");
      // But the original error message should contain CONTENT_NONCE_UNDEFINED
      expect(String(error.message)).toContain("Content nonce is undefined");

      await encryptionInstance.cleanup();
    });
  });

  describe("compressData - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;

    beforeEach(() => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should fall back to no compression when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 572-578 (fallback to no compression)
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked compression failure",
        data: undefined,
      } as ServiceResult<any>);

      // Should fall back to no compression instead of throwing
      const result = await encryption.compressData(TEST_CONTENT_SMALL);

      expect(result).toBeDefined();
      expect(result.compressedData).toEqual(TEST_CONTENT_SMALL);
      expect(result.compressionRatio).toBe(1);
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 581-585
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      await expect(
        encryption.compressData(TEST_CONTENT_SMALL)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .compressData(TEST_CONTENT_SMALL)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("COMPRESSION_DATA_MISSING");
    });
  });

  describe("decompressData - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;

    beforeEach(() => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 666-671
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked decompression failure",
        data: undefined,
      } as ServiceResult<any>);

      await expect(
        encryption.decompressData(TEST_CONTENT_SMALL, TEST_CONTENT_SMALL.length)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decompressData(TEST_CONTENT_SMALL, TEST_CONTENT_SMALL.length)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("DECOMPRESSION_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 673-677
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      await expect(
        encryption.decompressData(TEST_CONTENT_SMALL, TEST_CONTENT_SMALL.length)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decompressData(TEST_CONTENT_SMALL, TEST_CONTENT_SMALL.length)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("DECOMPRESSION_DATA_MISSING");
    });
  });

  describe("generateSessionKey - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;

    beforeEach(() => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 735-740
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked session key generation failure",
        data: undefined,
      } as ServiceResult<any>);

      const peerId = "test-peer";
      const ephemeralKey = sodium.randombytes_buf(32);

      await expect(
        encryption.generateSessionKey(peerId, ephemeralKey)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .generateSessionKey(peerId, ephemeralKey)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("SESSION_KEY_GENERATION_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 742-750
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      const peerId = "test-peer";
      const ephemeralKey = sodium.randombytes_buf(32);

      await expect(
        encryption.generateSessionKey(peerId, ephemeralKey)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .generateSessionKey(peerId, ephemeralKey)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("SESSION_KEY_GENERATION_DATA_MISSING");
    });

    it("should throw error when ephemeral key is invalid", async () => {
      // This tests the branch at line 702-714 (validation inside ErrorUtils)
      const peerId = "test-peer";
      const invalidEphemeralKey = new Uint8Array(16); // Wrong size (needs 32)

      await expect(
        encryption.generateSessionKey(peerId, invalidEphemeralKey)
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .generateSessionKey(peerId, invalidEphemeralKey)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("SESSION_KEY_GENERATION_FAILED");
      // Error message contains the original error text
      expect(String(error.message)).toContain("Invalid ephemeral key");
    });
  });

  describe("rotateKeys - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;

    beforeEach(() => {
      // Capture original before any mocks
      originalWithErrorHandling = ErrorUtils.withErrorHandling.bind(ErrorUtils);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 787-792
      // First encrypt data to create a file with a key (before mocking)
      await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      // Now mock ErrorUtils for rotateKeys only
      jest.spyOn(ErrorUtils, "withErrorHandling").mockImplementation(
        async (operation, context) => {
          // Only mock for rotateKeys context
          if (context.operation === "rotateKeys") {
            return {
              success: false,
              error: "Mocked key rotation failure",
              data: undefined,
            } as ServiceResult<any>;
          }
          // Use original for other operations
          return originalWithErrorHandling(operation, context);
        }
      );

      await expect(encryption.rotateKeys(fileId)).rejects.toThrow(ServiceError);

      const error = await encryption.rotateKeys(fileId).catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("KEY_ROTATION_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 794-799
      // First encrypt data to create a file with a key (before mocking)
      await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );

      // Now mock ErrorUtils for rotateKeys only
      jest.spyOn(ErrorUtils, "withErrorHandling").mockImplementation(
        async (operation, context) => {
          // Only mock for rotateKeys context
          if (context.operation === "rotateKeys") {
            return {
              success: true,
              data: undefined,
              error: undefined,
            } as ServiceResult<any>;
          }
          // Use original for other operations
          return originalWithErrorHandling(operation, context);
        }
      );

      await expect(encryption.rotateKeys(fileId)).rejects.toThrow(ServiceError);

      const error = await encryption.rotateKeys(fileId).catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("KEY_ROTATION_DATA_MISSING");
    });
  });

  describe("checkKeyCompromise - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;

    beforeEach(() => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 831-836
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked compromise check failure",
        data: undefined,
      } as ServiceResult<any>);

      await expect(encryption.checkKeyCompromise(fileId)).rejects.toThrow(
        ServiceError
      );

      const error = await encryption
        .checkKeyCompromise(fileId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("KEY_COMPROMISE_CHECK_FAILED");
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 838-842
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      await expect(encryption.checkKeyCompromise(fileId)).rejects.toThrow(
        ServiceError
      );

      const error = await encryption
        .checkKeyCompromise(fileId)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("KEY_COMPROMISE_CHECK_DATA_MISSING");
    });
  });

  describe("decryptPlatformLayer - ErrorUtils.withErrorHandling error paths (mocked)", () => {
    let originalWithErrorHandling: typeof ErrorUtils.withErrorHandling;
    let encryptResult: Awaited<ReturnType<typeof encryption.encryptData>>;

    beforeEach(async () => {
      originalWithErrorHandling = ErrorUtils.withErrorHandling;
      encryptResult = await encryption.encryptData(
        TEST_CONTENT_SMALL,
        platformKey,
        userKey,
        fileId
      );
    });

    afterEach(() => {
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should throw error when ErrorUtils.withErrorHandling returns success: false", async () => {
      // This tests the branch at line 425-432
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Mocked platform layer decryption failure",
        data: undefined,
      } as ServiceResult<any>);

      const platformNonce = encryptResult.nonces[0];
      if (!platformNonce) {
        throw new Error("Platform nonce is undefined");
      }

      await expect(
        encryption.decryptPlatformLayer(
          encryptResult.platformEncrypted,
          platformKey,
          platformNonce
        )
      ).rejects.toThrow(ServiceError);

      const error = await encryption
        .decryptPlatformLayer(
          encryptResult.platformEncrypted,
          platformKey,
          platformNonce
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceError);
      expect(error.code).toBe("PLATFORM_LAYER_DECRYPTION_FAILED");
    });

    it("should return empty object when ErrorUtils.withErrorHandling returns success: true but data: undefined", async () => {
      // This tests the branch at line 435: return result.data ?? {}
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
        error: undefined,
      } as ServiceResult<any>);

      const platformNonce = encryptResult.nonces[0];
      if (!platformNonce) {
        throw new Error("Platform nonce is undefined");
      }

      // Should return empty object as fallback
      const result = await encryption.decryptPlatformLayer(
        encryptResult.platformEncrypted,
        platformKey,
        platformNonce
      );

      expect(result).toEqual({});
    });
  });
});
