/**
 * ZKIMFileService Decrypt Tests
 * Tests for decryptZkimFile happy paths
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { TEST_CONTENT_SMALL, TEST_USER_ID } from "../fixtures/test-data";
import { createTestFileService, getTestKeys } from "./zkim-file-service.test-setup";

describe("ZKIMFileService - Decrypt", () => {
  let fileService: ZKIMFileService;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;

  beforeAll(async () => {
    const sodium = await import("libsodium-wrappers-sumo");
    await sodium.default.ready;
  });

  beforeEach(async () => {
    fileService = createTestFileService();
    await fileService.initialize();
    const keys = getTestKeys();
    platformKey = keys.platformKey;
    userKey = keys.userKey;
  });

  afterEach(async () => {
    await fileService.cleanup();
  });

  describe("decryptZkimFile", () => {
    it("should decrypt ZKIM file successfully", async () => {
      const createResult = await fileService.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "test.txt",
          mimeType: "text/plain",
        }
      );

      expect(createResult.success).toBe(true);

      const decrypted = await fileService.decryptZkimFile(
        createResult.file,
        TEST_USER_ID,
        userKey
      );

      expect(decrypted).toBeInstanceOf(Uint8Array);
      expect(decrypted).toEqual(TEST_CONTENT_SMALL);
    });

    it("should fail to decrypt with wrong key when user layer must be decrypted", async () => {
      // Create a file and manually remove contentKey from customFields to force user layer decryption
      const createResult = await fileService.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "test.txt",
          mimeType: "text/plain",
        }
      );

      expect(createResult.success).toBe(true);

      // Remove contentKey from customFields to force user layer decryption
      const fileWithoutContentKey = {
        ...createResult.file,
        metadata: {
          ...createResult.file.metadata,
          customFields: {
            ...createResult.file.metadata.customFields,
            contentKey: undefined,
          },
        },
      };

      const sodium = await import("libsodium-wrappers-sumo");
      await sodium.default.ready;
      const wrongKey = sodium.default.randombytes_buf(32);

      // This should fail when trying to decrypt the user layer with wrong key
      await expect(
        fileService.decryptZkimFile(fileWithoutContentKey, TEST_USER_ID, wrongKey)
      ).rejects.toThrow();
    });

    it("should decrypt file with multiple chunks", async () => {
      // Use a size larger than default chunk size (524288 bytes) to ensure multiple chunks
      const largeContent = new Uint8Array(600000); // ~600KB to create multiple chunks
      largeContent.fill(42);

      const createResult = await fileService.createZkimFile(
        largeContent,
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "large.txt",
          mimeType: "text/plain",
        }
      );

      expect(createResult.success).toBe(true);
      expect(createResult.file.chunks.length).toBeGreaterThan(1);

      const decrypted = await fileService.decryptZkimFile(
        createResult.file,
        TEST_USER_ID,
        userKey
      );

      expect(decrypted).toEqual(largeContent);
    });
  });
});

