/**
 * SearchableEncryption Rate Limiting Tests
 * Tests for rate limiting functionality and error paths
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { SearchableEncryption } from "../../src/core/searchable-encryption";
import { ServiceError } from "../../src/types/errors";
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

describe("SearchableEncryption - Rate Limiting", () => {
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

  describe("rate limiting", () => {
    it("should throw error when rate limit is exceeded", async () => {
      const serviceWithLowLimit = createTestSearchService({
        enableRateLimiting: true,
        maxQueriesPerEpoch: 1, // Very low limit
        epochDuration: 1000, // 1 second
      });
      await serviceWithLowLimit.initialize();

      const query = createTestQuery({ query: "test" });

      // First query should succeed
      await serviceWithLowLimit.search(query);

      // Second query should fail due to rate limit
      const secondQuery = createTestQuery({ queryId: "query-2" });

      // Verify the error has the correct code
      try {
        await serviceWithLowLimit.search(secondQuery);
        expect.fail("Should have thrown ServiceError");
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError);
        if (error instanceof ServiceError) {
          // Error might be wrapped, check for RATE_LIMIT_EXCEEDED in code or message
          expect(
            error.code === "RATE_LIMIT_EXCEEDED" || error.message.includes("Rate limit exceeded")
          ).toBe(true);
        }
      }

      await serviceWithLowLimit.cleanup();
    });

    it("should allow queries when rate limiting is disabled", async () => {
      const serviceWithoutRateLimit = createTestSearchService({
        enableRateLimiting: false,
      });
      await serviceWithoutRateLimit.initialize();

      const query = createTestQuery({ query: "test" });

      // Should succeed even with many queries
      for (let i = 0; i < 10; i++) {
        const result = await serviceWithoutRateLimit.search(
          createTestQuery({ queryId: `query-${i}` })
        );
        expect(result).toBeDefined();
      }

      await serviceWithoutRateLimit.cleanup();
    });
  });

  describe("search - rate limiting branches", () => {
    it("should skip rate limit check when rate limiting is disabled", async () => {
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
  });

  describe("checkRateLimit - branch paths", () => {
    it("should allow queries when under rate limit (line 755-780)", async () => {
      const serviceWithHighLimit = createTestSearchService({
        enableRateLimiting: true,
        maxQueriesPerEpoch: 1000,
      });
      await serviceWithHighLimit.initialize();

      const file = createTestFile();
      await serviceWithHighLimit.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      const result = await serviceWithHighLimit.search(query);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);

      await serviceWithHighLimit.cleanup();
    });

    it("should check queries within current epoch (line 759-765)", async () => {
      const serviceWithRateLimit = createTestSearchService({
        enableRateLimiting: true,
        maxQueriesPerEpoch: 10,
        epochDuration: 24 * 60 * 60 * 1000,
      });
      await serviceWithRateLimit.initialize();

      const file = createTestFile();
      await serviceWithRateLimit.indexFile(file, TEST_USER_ID);

      // Make multiple queries within the same epoch
      for (let i = 0; i < 5; i++) {
        const query = createTestQuery({ query: `test-${i}` });
        const result = await serviceWithRateLimit.search(query);
        expect(result).toBeDefined();
      }

      await serviceWithRateLimit.cleanup();
    });
  });
});

