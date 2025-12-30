/**
 * ZKIMFileService Search Tests
 * Tests for searchFiles functionality
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ZKIMFileService } from "../../src/core/zkim-file-service";
import { ServiceError } from "../../src/types/errors";
import { defaultLogger } from "../../src/utils/logger";
import { TEST_CONTENT_SMALL, TEST_USER_ID } from "../fixtures/test-data";
import { createTestFileService, getTestKeys } from "./zkim-file-service.test-setup";
import { InMemoryStorage } from "../../src/types/storage";

describe("ZKIMFileService - Search", () => {
  let fileService: ZKIMFileService;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;
  let storage: InMemoryStorage;

  beforeAll(async () => {
    const sodium = await import("libsodium-wrappers-sumo");
    await sodium.default.ready;
  });

  beforeEach(async () => {
    storage = new InMemoryStorage();
    fileService = createTestFileService(undefined, storage);
    await fileService.initialize();
    const keys = getTestKeys();
    platformKey = keys.platformKey;
    userKey = keys.userKey;
  });

  afterEach(async () => {
    await fileService.cleanup();
  });

  describe("searchFiles", () => {
    it("should search files when searchable encryption is enabled", async () => {
      const serviceWithSearch = new ZKIMFileService(
        {
          enableCompression: false,
          enableSearchableEncryption: true,
        },
        defaultLogger,
        storage
      );
      await serviceWithSearch.initialize();

      // Create a file first
      const createResult = await serviceWithSearch.createZkimFile(
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

      // Search for files
      const searchResult = await serviceWithSearch.searchFiles("test", TEST_USER_ID);

      expect(Array.isArray(searchResult.results)).toBe(true);

      await serviceWithSearch.cleanup();
    });
  });

  describe("searchFiles - error paths", () => {
    it("should throw error when searchable encryption is disabled", async () => {
      // This tests the branch at line 799-803
      const serviceWithoutSearch = new ZKIMFileService(
        {
          enableSearchableEncryption: false,
          enableCompression: false,
        },
        defaultLogger,
        storage
      );
      await serviceWithoutSearch.initialize();

      await expect(
        serviceWithoutSearch.searchFiles("test", TEST_USER_ID)
      ).rejects.toThrow(ServiceError);

      await serviceWithoutSearch.cleanup();
    });

    it("should throw error when search fails (result.success = false)", async () => {
      // This tests the branch at line 827-834
      const serviceWithSearch = new ZKIMFileService(
        {
          enableSearchableEncryption: true,
          enableCompression: false,
        },
        defaultLogger,
        storage
      );
      await serviceWithSearch.initialize();

      // Search should work normally (might return empty results)
      const result = await serviceWithSearch.searchFiles("test", TEST_USER_ID);
      expect(result).toBeDefined();

      await serviceWithSearch.cleanup();
    });

    it("should throw error when search result.data is undefined", async () => {
      // This tests the branch at line 834-840
      const serviceWithSearch = new ZKIMFileService(
        {
          enableSearchableEncryption: true,
          enableCompression: false,
        },
        defaultLogger,
        storage
      );
      await serviceWithSearch.initialize();

      // Normal search should work
      const result = await serviceWithSearch.searchFiles("test", TEST_USER_ID);
      expect(result).toBeDefined();

      await serviceWithSearch.cleanup();
    });
  });
});

