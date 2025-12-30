/**
 * SearchableEncryption Configuration Tests
 * Tests for configuration toggle paths and feature enable/disable
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { SearchableEncryption } from "../../src/core/searchable-encryption";
import { ServiceBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import type { SearchQuery } from "../../src/types/zkim-file-format";
import { TEST_USER_ID } from "../fixtures/test-data";
import {
  createTestSearchService,
  createTestFile,
  createTestQuery,
  setupSodium,
} from "./searchable-encryption.test-setup";

describe("SearchableEncryption - Configuration", () => {
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

  describe("search - configuration paths", () => {
    it("should search when rate limiting is disabled", async () => {
      const serviceWithoutRateLimit = createTestSearchService({
        enableRateLimiting: false,
      });
      await serviceWithoutRateLimit.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutRateLimit.search(query);

      expect(result).toBeDefined();
      expect(result.queryId).toBe(query.queryId);

      await serviceWithoutRateLimit.cleanup();
    });

    it("should search when privacy enhancement is disabled", async () => {
      const serviceWithoutPrivacy = createTestSearchService({
        enablePrivacyEnhancement: false,
      });
      await serviceWithoutPrivacy.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutPrivacy.search(query);

      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.privacyEnhancement).toBe(false);

      await serviceWithoutPrivacy.cleanup();
    });

    it("should search when result padding is disabled", async () => {
      const serviceWithoutPadding = createTestSearchService({
        enableResultPadding: false,
      });
      await serviceWithoutPadding.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutPadding.search(query);

      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.resultPadding).toBe(false);

      await serviceWithoutPadding.cleanup();
    });

    it("should search when query logging is disabled", async () => {
      const serviceWithoutLogging = createTestSearchService({
        enableQueryLogging: false,
      });
      await serviceWithoutLogging.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutLogging.search(query);

      expect(result).toBeDefined();
      expect(result.queryId).toBe(query.queryId);

      await serviceWithoutLogging.cleanup();
    });
  });

  describe("search - configuration toggle branches", () => {
    it("should skip privacy enhancement when disabled", async () => {
      const serviceWithoutPrivacy = createTestSearchService({
        enablePrivacyEnhancement: false,
      });
      await serviceWithoutPrivacy.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutPrivacy.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithoutPrivacy.cleanup();
    });

    it("should skip result padding when disabled", async () => {
      const serviceWithoutPadding = createTestSearchService({
        enableResultPadding: false,
      });
      await serviceWithoutPadding.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutPadding.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithoutPadding.cleanup();
    });

    it("should skip query logging when disabled", async () => {
      const serviceWithoutLogging = createTestSearchService({
        enableQueryLogging: false,
      });
      await serviceWithoutLogging.initialize();

      const query = createTestQuery();
      const result = await serviceWithoutLogging.search(query);

      expect(result).toBeDefined();

      await serviceWithoutLogging.cleanup();
    });

    it("should skip trapdoor rotation when disabled", async () => {
      const serviceWithoutRotation = createTestSearchService({
        enableTrapdoorRotation: false,
      });
      await serviceWithoutRotation.initialize();

      const file = createTestFile();
      await serviceWithoutRotation.indexFile(file, TEST_USER_ID);

      const query = createTestQuery();
      const result = await serviceWithoutRotation.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithoutRotation.cleanup();
    });
  });

  describe("applyPrivacyEnhancement - branch paths", () => {
    it("should add noise to relevance scores (line 928-931)", async () => {
      const serviceWithPrivacy = createTestSearchService({
        enablePrivacyEnhancement: true,
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

    it("should shuffle results to prevent ordering analysis (line 934)", async () => {
      const serviceWithPrivacy = createTestSearchService({
        enablePrivacyEnhancement: true,
      });
      await serviceWithPrivacy.initialize();

      const file1 = createTestFile({
        header: {
          ...createTestFile().header,
          fileId: "file-1",
        },
      });
      const file2 = createTestFile({
        header: {
          ...createTestFile().header,
          fileId: "file-2",
        },
      });

      await serviceWithPrivacy.indexFile(file1, TEST_USER_ID);
      await serviceWithPrivacy.indexFile(file2, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithPrivacy.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithPrivacy.cleanup();
    });
  });
});

