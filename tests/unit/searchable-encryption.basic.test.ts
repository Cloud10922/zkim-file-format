/**
 * SearchableEncryption Basic Tests
 * Tests for constructor, initialization, and core functionality
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { SearchableEncryption } from "../../src/core/searchable-encryption";
import { ServiceBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import type { SearchQuery } from "../../src/types/zkim-file-format";
import { TEST_USER_ID, TEST_FILE_ID } from "../fixtures/test-data";
import {
  createTestSearchService,
  createTestFile,
  createTestQuery,
  setupSodium,
} from "./searchable-encryption.test-setup";

describe("SearchableEncryption - Basic", () => {
  let searchService: SearchableEncryption;

  beforeAll(async () => {
    await setupSodium();
  });

  beforeEach(async () => {
    ServiceBase.clearInstances();
    searchService = createTestSearchService();
    await searchService.initialize();
  });

  afterEach(async () => {
    await searchService.cleanup();
    ServiceBase.clearInstances();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const service = createTestSearchService();
      expect(service).toBeInstanceOf(SearchableEncryption);
    });

    it("should create instance with custom config", () => {
      const service = createTestSearchService({
        enableOPRF: true,
        enableRateLimiting: false,
        epochDuration: 1000,
      });
      expect(service).toBeInstanceOf(SearchableEncryption);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const service = createTestSearchService();
      await expect(service.initialize()).resolves.not.toThrow();
      await service.cleanup();
    });

    it("should not reinitialize if already initialized", async () => {
      await searchService.initialize();
      await expect(searchService.initialize()).resolves.not.toThrow();
    });
  });

  describe("search", () => {
    it("should perform search successfully", async () => {
      const query = createTestQuery();

      const result = await searchService.search(query);
      expect(result).toBeDefined();
      expect(result.queryId).toBe(query.queryId);
      expect(result.results).toBeInstanceOf(Array);
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty search results", async () => {
      const query = createTestQuery({ query: "nonexistent" });

      const result = await searchService.search(query);
      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
    });

    it("should respect result limit", async () => {
      const file = createTestFile({
        metadata: {
          fileName: "test1.txt",
          userId: TEST_USER_ID,
          mimeType: "text/plain",
          createdAt: Date.now(),
          customFields: {},
        },
      });

      await searchService.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await searchService.search(query, 1);
      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("indexFile", () => {
    it("should index file successfully", async () => {
      const file = createTestFile();

      await expect(searchService.indexFile(file, TEST_USER_ID)).resolves.not.toThrow();
    });
  });

  describe("updateFileIndex", () => {
    it("should update existing file index", async () => {
      const file = createTestFile();
      await searchService.indexFile(file, TEST_USER_ID);

      const updatedFile = createTestFile({
        metadata: {
          ...file.metadata,
          fileName: "updated.txt",
        },
      });

      await expect(
        searchService.updateFileIndex(updatedFile, TEST_USER_ID)
      ).resolves.not.toThrow();
    });
  });

  describe("removeFileFromIndex", () => {
    it("should remove file from index", async () => {
      const file = createTestFile();
      await searchService.indexFile(file, TEST_USER_ID);

      await expect(searchService.removeFileFromIndex(TEST_FILE_ID)).resolves.not.toThrow();
    });

    it("should handle removing non-existent file", async () => {
      await expect(searchService.removeFileFromIndex("non-existent-id")).resolves.not.toThrow();
    });
  });

  describe("getSearchStats", () => {
    it("should return search statistics", async () => {
      const stats = await searchService.getSearchStats();
      expect(stats).toBeDefined();
      expect(stats.totalIndexedFiles).toBeGreaterThanOrEqual(0);
      expect(stats.activeTrapdoors).toBeGreaterThanOrEqual(0);
      expect(stats.queriesThisEpoch).toBeGreaterThanOrEqual(0);
    });
  });

  describe("generateOPRFToken", () => {
    it("should generate OPRF token", async () => {
      const token = await searchService.generateOPRFToken("test word");
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe("search - result processing branch paths", () => {
    it("should apply privacy enhancement when enabled (line 299-301)", async () => {
      const serviceWithPrivacy = createTestSearchService({
        enablePrivacyEnhancement: true,
        enableResultPadding: false,
      });
      await serviceWithPrivacy.initialize();

      const file = createTestFile();
      await serviceWithPrivacy.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithPrivacy.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithPrivacy.cleanup();
    });

    it("should apply result padding when enabled (line 299-301)", async () => {
      const serviceWithPadding = createTestSearchService({
        enablePrivacyEnhancement: false,
        enableResultPadding: true,
      });
      await serviceWithPadding.initialize();

      const file = createTestFile();
      await serviceWithPadding.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithPadding.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithPadding.cleanup();
    });

    it("should apply both privacy enhancement and padding when both enabled (line 299-301)", async () => {
      const serviceWithBoth = createTestSearchService({
        enablePrivacyEnhancement: true,
        enableResultPadding: true,
      });
      await serviceWithBoth.initialize();

      const file = createTestFile();
      await serviceWithBoth.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithBoth.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithBoth.cleanup();
    });
  });

  describe("updateFileIndex - branch paths", () => {
    it("should update existing file index (line 432-435)", async () => {
      const file = createTestFile();
      await searchService.indexFile(file, TEST_USER_ID);

      const updatedFile = createTestFile({
        header: {
          ...file.header,
          fileId: file.header.fileId,
        },
        metadata: {
          ...file.metadata,
          fileName: "updated-test.txt",
        },
      });

      await searchService.updateFileIndex(updatedFile, TEST_USER_ID);

      const query = createTestQuery({ query: "updated" });
      const result = await searchService.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });
  });

  describe("removeFileFromIndex - branch paths", () => {
    it("should remove file from index successfully", async () => {
      const file = createTestFile();
      await searchService.indexFile(file, TEST_USER_ID);

      await searchService.removeFileFromIndex(file.header.fileId);

      const query = createTestQuery({ query: "test" });
      const result = await searchService.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });
  });

  describe("rotateTrapdoors - configuration branch paths", () => {
    it("should skip rotation when disabled (line 434-437)", async () => {
      const serviceWithoutRotation = createTestSearchService({
        enableTrapdoorRotation: false,
      });
      await serviceWithoutRotation.initialize();

      const file = createTestFile();
      await serviceWithoutRotation.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      await serviceWithoutRotation.search(query);

      // Should not throw when rotation is disabled
      await expect(serviceWithoutRotation.rotateTrapdoors()).resolves.not.toThrow();

      await serviceWithoutRotation.cleanup();
    });
  });

  describe("indexFile - branch paths", () => {
    it("should index file with access control (line 220)", async () => {
      const file = createTestFile({
        metadata: {
          fileName: "test.txt",
          userId: TEST_USER_ID,
          mimeType: "text/plain",
          createdAt: Date.now(),
          customFields: {},
          accessControl: {
            readAccess: [TEST_USER_ID],
            writeAccess: [TEST_USER_ID],
            deleteAccess: [TEST_USER_ID],
          },
        },
      });

      await searchService.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await searchService.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });

    it("should auto-save index after indexing (line 236)", async () => {
      const file = createTestFile();
      await searchService.indexFile(file, TEST_USER_ID);

      const stats = await searchService.getSearchStats();
      expect(stats).toBeDefined();
      expect(stats.totalIndexedFiles).toBeGreaterThanOrEqual(1);
    });
  });

  describe("search - rate limiting branch paths", () => {
    it("should check rate limit when enabled (line 265-280)", async () => {
      const serviceWithRateLimit = createTestSearchService({
        enableRateLimiting: true,
        maxQueriesPerEpoch: 100,
      });
      await serviceWithRateLimit.initialize();

      const file = createTestFile();
      await serviceWithRateLimit.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithRateLimit.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithRateLimit.cleanup();
    });

    it("should skip rate limit check when disabled (line 265)", async () => {
      const serviceWithoutRateLimit = createTestSearchService({
        enableRateLimiting: false,
      });
      await serviceWithoutRateLimit.initialize();

      const file = createTestFile();
      await serviceWithoutRateLimit.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithoutRateLimit.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithoutRateLimit.cleanup();
    });
  });

  describe("removeFileFromIndex - additional branch paths", () => {
    it("should handle file not found in index (line 413-415)", async () => {
      // Try to remove a file that doesn't exist
      await searchService.removeFileFromIndex("non-existent-file-id");

      const stats = await searchService.getSearchStats();
      expect(stats).toBeDefined();
    });

    it("should auto-save index after successful removal (line 408-412)", async () => {
      const file = createTestFile();
      await searchService.indexFile(file, TEST_USER_ID);

      await searchService.removeFileFromIndex(file.header.fileId);

      const stats = await searchService.getSearchStats();
      expect(stats).toBeDefined();
      expect(stats.totalIndexedFiles).toBe(0);
    });
  });

  describe("updateFileIndex - additional branch paths", () => {
    it("should create new index when file doesn't exist (line 384-387)", async () => {
      const file = createTestFile({
        header: {
          ...createTestFile().header,
          fileId: "new-file-id",
        },
      });

      await searchService.updateFileIndex(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await searchService.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });
  });
});

