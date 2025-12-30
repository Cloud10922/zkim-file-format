/**
 * ZKIMFileService Get Tests
 * Tests for getZkimFile happy paths
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { TEST_CONTENT_SMALL, TEST_USER_ID } from "../fixtures/test-data";
import { createTestFileService, getTestKeys } from "./zkim-file-service.test-setup";

describe("ZKIMFileService - Get", () => {
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

  describe("getZkimFile", () => {
    it("should retrieve ZKIM file by object ID", async () => {
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

      const getResult = await fileService.getZkimFile(createResult.objectId ?? createResult.file.header.fileId);

      expect(getResult.success).toBe(true);
      expect(getResult.data).toBeDefined();
      expect(getResult.data?.header.fileId).toBe(createResult.file.header.fileId);
    });

    it("should return error for non-existent file", async () => {
      const result = await fileService.getZkimFile("non-existent-id");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

