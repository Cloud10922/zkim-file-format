/**
 * ZKIMFileService Create Tests
 * Tests for createZkimFile happy paths and storage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ZKIMFileService } from "../../src/core/zkim-file-service";
import { ServiceError } from "../../src/types/errors";
import type { ZkimFileMetadata } from "../../src/types/zkim-file-format";
import { TEST_CONTENT_SMALL, TEST_CONTENT_MEDIUM, TEST_USER_ID } from "../fixtures/test-data";
import { createTestFileService, getTestKeys } from "./zkim-file-service.test-setup";

describe("ZKIMFileService - Create", () => {
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

  describe("createZkimFile", () => {
    it("should create ZKIM file successfully", async () => {
      const result = await fileService.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "test.txt",
          mimeType: "text/plain",
        }
      );

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file.header.magic).toBe("ZKIM");
      expect(result.file.header.fileId).toBeDefined();
      expect(result.file.chunks.length).toBeGreaterThan(0);
    });

    it("should create file with metadata", async () => {
      const metadata: Partial<ZkimFileMetadata> = {
        fileName: "test-file.txt",
        mimeType: "text/plain",
      };

      const result = await fileService.createZkimFile(
        TEST_CONTENT_SMALL,
        TEST_USER_ID,
        platformKey,
        userKey,
        metadata
      );

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file.metadata.fileName).toBe("test-file.txt");
      expect(result.file.metadata.mimeType).toBe("text/plain");
    });

    it("should handle empty content", async () => {
      const result = await fileService.createZkimFile(
        new Uint8Array(0),
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "empty.txt",
          mimeType: "text/plain",
        }
      );

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
    });

    it("should create file with different content sizes", async () => {
      const mediumContent = TEST_CONTENT_MEDIUM;

      const result = await fileService.createZkimFile(
        mediumContent,
        TEST_USER_ID,
        platformKey,
        userKey,
        {
          fileName: "medium.txt",
          mimeType: "text/plain",
        }
      );

      expect(result.success).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file.header.totalSize).toBe(mediumContent.length);
    });
  });

  describe("createZkimFile - storage", () => {
    it("should save ZKIM file to storage during creation", async () => {
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
      expect(createResult.objectId).toBeDefined();
      expect(createResult.objectId).toBe(createResult.file.header.fileId);

      // Verify file can be retrieved from storage
      const getResult = await fileService.getZkimFile(createResult.objectId ?? createResult.file.header.fileId);
      expect(getResult.success).toBe(true);
      expect(getResult.data).toBeDefined();
    });

    it("should create file without storage backend", async () => {
      const serviceWithoutStorage = createTestFileService(undefined, undefined);
      await serviceWithoutStorage.initialize();

      const createResult = await serviceWithoutStorage.createZkimFile(
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
      expect(createResult.objectId).toBeDefined();

      await serviceWithoutStorage.cleanup();
    });
  });
});

