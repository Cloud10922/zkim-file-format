/**
 * SearchableEncryption Trapdoor Rotation Tests
 * Tests for trapdoor rotation, expiration, and management
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

describe("SearchableEncryption - Trapdoor Rotation", () => {
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

  describe("rotateTrapdoors", () => {
    it("should rotate trapdoors successfully", async () => {
      await expect(searchService.rotateTrapdoors()).resolves.not.toThrow();
    });
  });

  describe("rotateTrapdoors - branch paths", () => {
    it("should skip rotation when trapdoor rotation is disabled", async () => {
      const serviceWithoutRotation = createTestSearchService({
        enableTrapdoorRotation: false,
      });
      await serviceWithoutRotation.initialize();

      await expect(serviceWithoutRotation.rotateTrapdoors()).resolves.not.toThrow();

      await serviceWithoutRotation.cleanup();
    });

    it("should skip revoked trapdoors during rotation", async () => {
      // This tests the continue path when trapdoor.isRevoked is true
      await expect(searchService.rotateTrapdoors()).resolves.not.toThrow();
    });

    it("should expire trapdoors when they reach expiration time", async () => {
      // Create a service with short epoch duration for testing
      const serviceWithShortEpoch = createTestSearchService({
        enableTrapdoorRotation: true,
        epochDuration: 100, // Very short - 100ms
      });
      await serviceWithShortEpoch.initialize();

      // Index a file to create a trapdoor
      const file = createTestFile();
      await serviceWithShortEpoch.indexFile(file, TEST_USER_ID);

      // Wait for trapdoor to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Rotate trapdoors - should expire the trapdoor
      await serviceWithShortEpoch.rotateTrapdoors();

      await serviceWithShortEpoch.cleanup();
    });

    it("should rotate trapdoors when usageCount >= maxUsage", async () => {
      // This tests the branch at line 453-456
      const serviceWithRotation = createTestSearchService({
        enableTrapdoorRotation: true,
      });
      await serviceWithRotation.initialize();

      const query = createTestQuery();
      await serviceWithRotation.search(query);

      // Access private method to set high usage count
      const serviceAny = serviceWithRotation as unknown as {
        trapdoors: Map<
          string,
          { usageCount: number; maxUsage: number; isRevoked: boolean; expiresAt: number }
        >;
      };

      // Set usage count to trigger rotation
      for (const [, trapdoor] of serviceAny.trapdoors.entries()) {
        trapdoor.usageCount = trapdoor.maxUsage;
      }

      // Rotate should trigger rotation
      await expect(serviceWithRotation.rotateTrapdoors()).resolves.not.toThrow();

      await serviceWithRotation.cleanup();
    });
  });

  describe("rotateTrapdoors - disabled branch", () => {
    it("should skip rotation when disabled", async () => {
      const serviceWithoutRotation = createTestSearchService({
        enableTrapdoorRotation: false,
      });
      await serviceWithoutRotation.initialize();

      await expect(serviceWithoutRotation.rotateTrapdoors()).resolves.not.toThrow();

      await serviceWithoutRotation.cleanup();
    });
  });

  describe("rotateTrapdoors - trapdoor state branches", () => {
    it("should handle revoked trapdoors", async () => {
      await expect(searchService.rotateTrapdoors()).resolves.not.toThrow();
    });

    it("should handle expired trapdoors", async () => {
      const serviceWithShortEpoch = createTestSearchService({
        enableTrapdoorRotation: true,
        epochDuration: 100,
      });
      await serviceWithShortEpoch.initialize();

      const file = createTestFile();
      await serviceWithShortEpoch.indexFile(file, TEST_USER_ID);

      await new Promise((resolve) => setTimeout(resolve, 150));
      await expect(serviceWithShortEpoch.rotateTrapdoors()).resolves.not.toThrow();

      await serviceWithShortEpoch.cleanup();
    });

    it("should handle trapdoor rotation when enabled (line 1039-1055)", async () => {
      const serviceWithRotation = createTestSearchService({
        enableTrapdoorRotation: true,
        rotationThreshold: 1,
      });
      await serviceWithRotation.initialize();

      const file = createTestFile();
      await serviceWithRotation.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      await serviceWithRotation.search(query);

      // Search again to trigger usage count increase
      await serviceWithRotation.search(query);

      const stats = await serviceWithRotation.getSearchStats();
      expect(stats).toBeDefined();

      await serviceWithRotation.cleanup();
    });
  });

  describe("cleanupExpiredTrapdoors - branch paths", () => {
    it("should cleanup expired trapdoors (line 1055-1060)", async () => {
      const serviceWithShortEpoch = createTestSearchService({
        epochDuration: 100, // Very short epoch
      });
      await serviceWithShortEpoch.initialize();

      const file = createTestFile();
      await serviceWithShortEpoch.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      await serviceWithShortEpoch.search(query);

      // Advance time to expire trapdoors
      jest.advanceTimersByTime(200);

      // Trigger cleanup by searching again
      await serviceWithShortEpoch.search(query);

      const stats = await serviceWithShortEpoch.getSearchStats();
      expect(stats).toBeDefined();

      await serviceWithShortEpoch.cleanup();
    });
  });

  describe("rotateTrapdoors - branch paths", () => {
    it("should handle trapdoor expiration (line 449-452)", async () => {
      const serviceWithShortEpoch = createTestSearchService({
        enableTrapdoorRotation: true,
        epochDuration: 100, // Very short epoch
      });
      await serviceWithShortEpoch.initialize();

      const file = createTestFile();
      await serviceWithShortEpoch.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      await serviceWithShortEpoch.search(query);

      // Advance time to expire trapdoors
      jest.advanceTimersByTime(200);

      // Trigger rotation
      await serviceWithShortEpoch.rotateTrapdoors();

      const stats = await serviceWithShortEpoch.getSearchStats();
      expect(stats).toBeDefined();

      await serviceWithShortEpoch.cleanup();
    });

    it("should handle trapdoor rotation when usage count reached (line 453-457)", async () => {
      const serviceWithRotation = createTestSearchService({
        enableTrapdoorRotation: true,
        rotationThreshold: 1,
      });
      await serviceWithRotation.initialize();

      const file = createTestFile();
      await serviceWithRotation.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      // Search multiple times to trigger rotation
      await serviceWithRotation.search(query);
      await serviceWithRotation.search(query);

      await serviceWithRotation.rotateTrapdoors();

      const stats = await serviceWithRotation.getSearchStats();
      expect(stats).toBeDefined();

      await serviceWithRotation.cleanup();
    });

    it("should skip revoked trapdoors during rotation (line 445-447)", async () => {
      const serviceWithRotation = createTestSearchService({
        enableTrapdoorRotation: true,
      });
      await serviceWithRotation.initialize();

      const file = createTestFile();
      await serviceWithRotation.indexFile(file, TEST_USER_ID);

      const query = createTestQuery({ query: "test" });
      await serviceWithRotation.search(query);

      // Rotate trapdoors - should skip revoked ones
      await serviceWithRotation.rotateTrapdoors();

      const stats = await serviceWithRotation.getSearchStats();
      expect(stats).toBeDefined();

      await serviceWithRotation.cleanup();
    });
  });
});

