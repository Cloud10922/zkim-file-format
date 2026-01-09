/**
 * ZKIM File Service Tests
 * Comprehensive tests for file service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { ZKIMFileService } from "../../src/core/zkim-file-service";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import { InMemoryStorage } from "../../src/types/storage";
import { ServiceError } from "../../src/types/errors";

const TEST_USER_ID = "test-user-id";

describe("ZKIMFileService", () => {
  let fileService: ZKIMFileService;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;
  let storage: InMemoryStorage;

  beforeAll(async () => {
    await sodium.ready;
    platformKey = sodium.randombytes_buf(32);
    userKey = sodium.randombytes_buf(32);
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    storage = new InMemoryStorage();
    fileService = new ZKIMFileService(undefined, defaultLogger, storage);
    await fileService.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (fileService) {
      await fileService.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new ZKIMFileService(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(ZKIMFileService);
    });

    it("should create instance with custom config", () => {
      const instance = new ZKIMFileService(
        {
          enableCompression: false,
          maxFileSize: 1000000,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(ZKIMFileService);
    });

    it("should create instance with storage service", () => {
      const storage = new InMemoryStorage();
      const instance = new ZKIMFileService(undefined, defaultLogger, storage);
      expect(instance).toBeInstanceOf(ZKIMFileService);
    });
  });

  describe("createZkimFile", () => {
    it("should create ZKIM file from string data", async () => {
      jest.useRealTimers();
      const data = "test file content";
      const result = await fileService.createZkimFile(
        data,
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "test.txt" },
        true // Skip CAS storage
      );

      expect(result).toHaveProperty("success");
      if (result.success && result.data) {
        expect(result.data).toHaveProperty("header");
        expect(result.data).toHaveProperty("chunks");
        expect(result.data).toHaveProperty("metadata");
        expect(result.data.header.magic).toBe("ZKIM");
        expect(result.data.header.fileId).toBeDefined();
      }
      jest.useFakeTimers();
    });

    it("should create ZKIM file from Uint8Array data", async () => {
      jest.useRealTimers();
      const data = new TextEncoder().encode("test binary data");
      const result = await fileService.createZkimFile(
        data,
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "test.bin" },
        true
      );

      expect(result).toHaveProperty("success");
      if (result.success && result.data) {
        expect(result.data.header.chunkCount).toBeGreaterThanOrEqual(0);
      }
      jest.useFakeTimers();
    });

    it("should reject file exceeding max size", async () => {
      jest.useRealTimers();
      // Create a file service with smaller max size
      const smallFileService = new ZKIMFileService(
        { maxFileSize: 1000 },
        defaultLogger,
        storage
      );
      await smallFileService.initialize();

      const largeData = new Uint8Array(2000); // Exceeds 1000 byte limit
      largeData.fill(0);

      await expect(
        smallFileService.createZkimFile(
          largeData,
          TEST_USER_ID,
          platformKey,
          userKey,
          undefined,
          true
        )
      ).rejects.toThrow(ServiceError);

      await smallFileService.cleanup();
      jest.useFakeTimers();
    });
  });

  describe("decryptZkimFile", () => {
    it("should decrypt ZKIM file", async () => {
      jest.useRealTimers();
      const data = "test encrypted content";
      const createResult = await fileService.createZkimFile(
        data,
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "test.txt" },
        true
      );

      if (createResult.success && createResult.data) {
        const decrypted = await fileService.decryptZkimFile(
          createResult.data,
          TEST_USER_ID,
          userKey
        );

        expect(decrypted).toBeInstanceOf(Uint8Array);
        const decryptedText = new TextDecoder().decode(decrypted);
        expect(decryptedText).toBe(data);
      }
      jest.useFakeTimers();
    });
  });

  describe("getZkimFile", () => {
    it("should get ZKIM file from storage", async () => {
      jest.useRealTimers();
      const data = "test file";
      const createResult = await fileService.createZkimFile(
        data,
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "test.txt" },
        false // Store to CAS
      );

      if (createResult.success && createResult.data && createResult.data.objectId) {
        const retrieved = await fileService.getZkimFile(
          createResult.data.objectId
        );

        expect(retrieved).toHaveProperty("success");
        if (retrieved.success && retrieved.data) {
          expect(retrieved.data.header.magic).toBe("ZKIM");
        }
      }
      jest.useFakeTimers();
    });
  });

  describe("searchFiles", () => {
    it("should search files", async () => {
      jest.useRealTimers();
      // First create a file to search
      await fileService.createZkimFile(
        "test searchable content",
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "searchable.txt" },
        true
      );

      const result = await fileService.searchFiles("test", TEST_USER_ID);
      expect(result).toHaveProperty("queryId");
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("totalResults");
      jest.useFakeTimers();
    });
  });

  describe("validateFileIntegrity", () => {
    it("should validate file integrity", async () => {
      jest.useRealTimers();
      const data = "test file";
      const createResult = await fileService.createZkimFile(
        data,
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "test.txt" },
        true
      );

      if (createResult.success && createResult.data) {
        const validation = await fileService.validateFileIntegrity(
          createResult.data
        );

        expect(validation).toHaveProperty("isValid");
        expect(validation).toHaveProperty("errors");
      }
      jest.useFakeTimers();
    });
  });

  describe("updateFileMetadata", () => {
    it("should update file metadata", async () => {
      jest.useRealTimers();
      const data = "test file";
      const createResult = await fileService.createZkimFile(
        data,
        TEST_USER_ID,
        platformKey,
        userKey,
        { fileName: "test.txt" },
        true
      );

      if (createResult.success && createResult.data) {
        const updated = await fileService.updateFileMetadata(
          createResult.data,
          TEST_USER_ID,
          { fileName: "updated.txt", tags: ["updated"] }
        );

        expect(updated).toBeDefined();
        if (updated) {
          expect(updated.metadata.fileName).toBe("updated.txt");
        }
      }
      jest.useFakeTimers();
    });
  });
});

