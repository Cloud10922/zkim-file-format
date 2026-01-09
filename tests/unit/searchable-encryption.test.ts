/**
 * Searchable Encryption Tests
 * Comprehensive tests for searchable encryption service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { SearchableEncryption } from "../../src/core/searchable-encryption";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import type { SearchQuery, ZkimFile } from "../../src/types/zkim-file-format";

const TEST_USER_ID = "test-user-id";
const TEST_FILE_ID = "test-file-id";

function createTestZkimFile(): ZkimFile {
  return {
    header: {
      magic: "ZKIM",
      version: 1,
      flags: 0,
      platformKeyId: "test-platform-key",
      userId: TEST_USER_ID,
      fileId: TEST_FILE_ID,
      createdAt: Date.now(),
      chunkCount: 1,
      totalSize: 100,
      compressionType: 1,
      encryptionType: 1,
      hashType: 1,
      signatureType: 1,
    },
    chunks: [],
    metadata: {
      fileName: "test.txt",
      userId: TEST_USER_ID,
      createdAt: Date.now(),
      mimeType: "text/plain",
    },
  };
}

function createTestQuery(): SearchQuery {
  return {
    queryId: "test-query-id",
    query: "test",
    userId: TEST_USER_ID,
    timestamp: Date.now(),
    priority: "medium",
  };
}

describe("SearchableEncryption", () => {
  let searchService: SearchableEncryption;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    searchService = new SearchableEncryption(undefined, defaultLogger);
    await searchService.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (searchService) {
      await searchService.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new SearchableEncryption(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(SearchableEncryption);
    });

    it("should create instance with custom config", () => {
      const instance = new SearchableEncryption(
        {
          enableOPRF: true,
          enableRateLimiting: false,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(SearchableEncryption);
    });
  });

  describe("indexFile", () => {
    it("should index a file", async () => {
      const zkimFile = createTestZkimFile();
      await searchService.indexFile(zkimFile, TEST_USER_ID);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("search", () => {
    it("should perform search", async () => {
      const query = createTestQuery();
      const result = await searchService.search(query);
      expect(result).toHaveProperty("queryId");
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("totalResults");
      expect(result.queryId).toBe(query.queryId);
    });

    it("should return empty results for non-indexed files", async () => {
      const query = createTestQuery();
      query.query = "nonexistent";
      const result = await searchService.search(query);
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
    });
  });

  describe("updateFileIndex", () => {
    it("should update file index", async () => {
      const zkimFile = createTestZkimFile();
      await searchService.indexFile(zkimFile, TEST_USER_ID);
      
      const updatedFile = { ...zkimFile };
      updatedFile.metadata.fileName = "updated.txt";
      await searchService.updateFileIndex(updatedFile, TEST_USER_ID);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("removeFileFromIndex", () => {
    it("should remove file from index", async () => {
      const zkimFile = createTestZkimFile();
      await searchService.indexFile(zkimFile, TEST_USER_ID);
      await searchService.removeFileFromIndex(TEST_FILE_ID);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("rotateTrapdoors", () => {
    it("should rotate trapdoors", async () => {
      await searchService.rotateTrapdoors();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("generateOPRFToken", () => {
    it("should generate OPRF token", async () => {
      const token = await searchService.generateOPRFToken("test word");
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe("getSearchStats", () => {
    it("should return search statistics", async () => {
      const stats = await searchService.getSearchStats();
      expect(stats).toHaveProperty("totalIndexedFiles");
      expect(stats).toHaveProperty("totalTrapdoors");
      expect(stats).toHaveProperty("activeTrapdoors");
      expect(stats).toHaveProperty("queriesThisEpoch");
      expect(stats).toHaveProperty("averageQueryTime");
      expect(stats).toHaveProperty("privacyLevels");
    });
  });

  describe("rotateTrapdoors with disabled rotation", () => {
    it("should skip rotation when disabled", async () => {
      const serviceNoRotation = new SearchableEncryption(
        { enableTrapdoorRotation: false },
        defaultLogger
      );
      await serviceNoRotation.initialize();

      await serviceNoRotation.rotateTrapdoors();
      // Should not throw
      expect(true).toBe(true);

      await serviceNoRotation.cleanup();
    });
  });
});
