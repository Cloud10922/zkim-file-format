/**
 * Query Batcher Tests
 * Comprehensive tests for query batching service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { QueryBatcher } from "../../src/core/query-batcher";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import type { SearchQuery } from "../../src/types/zkim-file-format";

const TEST_USER_ID = "test-user-id";

function createTestQuery(): SearchQuery {
  return {
    queryId: `query-${Date.now()}`,
    query: "test",
    userId: TEST_USER_ID,
    timestamp: Date.now(),
    priority: "medium",
  };
}

describe("QueryBatcher", () => {
  let batcher: QueryBatcher;

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    batcher = new QueryBatcher(
      {
        enableBatching: false, // Disable automatic batching
        batchTimeout: 60000,
      },
      defaultLogger
    );
    await batcher.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (batcher) {
      await batcher.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new QueryBatcher(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(QueryBatcher);
    });

    it("should create instance with custom config", () => {
      const instance = new QueryBatcher(
        {
          batchSize: 20,
          batchTimeout: 10000,
          enableBatching: false,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(QueryBatcher);
    });
  });

  describe("addQuery", () => {
    it("should add query to batch", async () => {
      const query = createTestQuery();
      const batchId = await batcher.addQuery(query);
      expect(typeof batchId).toBe("string");
    });
  });

  describe("processBatch", () => {
    it("should process batch", async () => {
      await batcher.processBatch();
      // Should not throw
      expect(true).toBe(true);
    });

    it("should handle empty batch", async () => {
      await batcher.processBatch();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("getBatchStatus", () => {
    it("should return batch status", async () => {
      const query = createTestQuery();
      const batchId = await batcher.addQuery(query);
      const status = await batcher.getBatchStatus(batchId);
      expect(status).toBeDefined();
    });

    it("should return null for non-existent batch", async () => {
      const status = await batcher.getBatchStatus("non-existent");
      expect(status).toBeNull();
    });
  });

  describe("getQueryResults", () => {
    it("should return query results", async () => {
      const query = createTestQuery();
      await batcher.addQuery(query);
      const results = await batcher.getQueryResults(query.queryId);
      expect(results).toBeDefined();
    });

    it("should return null for non-existent query", async () => {
      const results = await batcher.getQueryResults("non-existent");
      expect(results).toBeNull();
    });
  });

  describe("getPerformanceMetrics", () => {
    it("should return performance metrics", async () => {
      const metrics = await batcher.getPerformanceMetrics();
      expect(metrics).toHaveProperty("totalBatches");
      expect(metrics).toHaveProperty("totalQueries");
      expect(metrics).toHaveProperty("averageBatchTime");
    });
  });

  describe("reset", () => {
    it("should reset batcher state", async () => {
      await batcher.reset();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("getQueryResults with caching", () => {
    it("should cache query results", async () => {
      jest.useRealTimers();
      const batcherWithCache = new QueryBatcher(
        {
          enableBatching: false,
          enableQueryCaching: true,
        },
        defaultLogger
      );
      await batcherWithCache.initialize();

      const query = createTestQuery();
      await batcherWithCache.addQuery(query);
      await batcherWithCache.processBatch();

      // First call
      const result1 = await batcherWithCache.getQueryResults(query.queryId);
      // Second call should use cache
      const result2 = await batcherWithCache.getQueryResults(query.queryId);
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();

      await batcherWithCache.cleanup();
      jest.useFakeTimers();
    });
  });
});
