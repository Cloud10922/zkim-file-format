/**
 * ZKIMFileService Storage Tests
 * Tests for storage service branches and storage-related functionality
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ZKIMFileService } from "../../src/core/zkim-file-service";
import type { IStorageBackend } from "../../src/types/storage";
import { defaultLogger } from "../../src/utils/logger";
import { TEST_CONTENT_SMALL, TEST_USER_ID } from "../fixtures/test-data";
import { createTestFileService, getTestKeys } from "./zkim-file-service.test-setup";
import { InMemoryStorage } from "../../src/types/storage";

describe("ZKIMFileService - Storage", () => {
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

  describe("createZkimFile - storage service branches", () => {
    it("should skip CAS storage when storage service is not available", async () => {
      const serviceWithoutStorage = new ZKIMFileService(
        {
          enableCompression: false,
        },
        defaultLogger
        // No storage service provided
      );
      await serviceWithoutStorage.initialize();

      const result = await serviceWithoutStorage.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        {}
      );

      expect(result).toBeDefined();
      expect(result.file).toBeDefined();
      // objectId should be fileId when storage is not available
      expect(result.objectId).toBe(result.file.header.fileId);

      await serviceWithoutStorage.cleanup();
    });

    it("should use CAS storage when storage service is available", async () => {
      const serviceWithStorage = new ZKIMFileService(
        {
          enableCompression: false,
        },
        defaultLogger,
        storage
      );
      await serviceWithStorage.initialize();

      const result = await serviceWithStorage.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        {}
      );

      expect(result).toBeDefined();
      expect(result.file).toBeDefined();
      expect(result.objectId).toBeDefined();

      await serviceWithStorage.cleanup();
    });
  });

  describe("updateFileMetadata - storage service branches", () => {
    it("should skip storage update when storage service is not available", async () => {
      const serviceWithoutStorage = new ZKIMFileService(
        {
          enableCompression: false,
        },
        defaultLogger
        // No storage service
      );
      await serviceWithoutStorage.initialize();

      const createResult = await serviceWithoutStorage.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "test.txt",
          accessControl: {
            readAccess: [TEST_USER_ID],
            writeAccess: [TEST_USER_ID],
            deleteAccess: [],
          },
        }
      );

      // Update metadata - should work even without storage
      const updated = await serviceWithoutStorage.updateFileMetadata(
        createResult.file,
        TEST_USER_ID,
        { fileName: "updated.txt" }
      );

      expect(updated).toBeDefined();
      expect(updated.metadata.fileName).toBe("updated.txt");

      await serviceWithoutStorage.cleanup();
    });
  });

  describe("getZkimFile - storage service branches", () => {
    it("should return error when storage service is not available", async () => {
      const serviceWithoutStorage = new ZKIMFileService(
        {
          enableCompression: false,
        },
        defaultLogger
        // No storage service
      );
      await serviceWithoutStorage.initialize();

      const result = await serviceWithoutStorage.getZkimFile("test-id");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Storage service not available");

      await serviceWithoutStorage.cleanup();
    });
  });

  describe("downloadFile - storage service branches", () => {
    it("should return error when storage service is not available", async () => {
      const serviceWithoutStorage = new ZKIMFileService(
        {
          enableCompression: false,
        },
        defaultLogger
        // No storage service
      );
      await serviceWithoutStorage.initialize();

      const result = await serviceWithoutStorage.downloadFile("test-id", TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Storage service not available");

      await serviceWithoutStorage.cleanup();
    });

    it("should return error when stored content is empty", async () => {
      const emptyStorage: IStorageBackend = {
        set: async () => {},
        get: async () => new Uint8Array(0), // Empty content
        has: async () => true,
        delete: async () => {},
        keys: async () => [],
        clear: async () => {},
      };

      const serviceWithEmptyStorage = new ZKIMFileService(
        {
          enableCompression: false,
        },
        defaultLogger,
        emptyStorage
      );
      await serviceWithEmptyStorage.initialize();

      const result = await serviceWithEmptyStorage.downloadFile("test-id", TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Content not found or empty");

      await serviceWithEmptyStorage.cleanup();
    });
  });
});

