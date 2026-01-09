/**
 * Trapdoor Rotator Tests
 * Comprehensive tests for trapdoor rotation service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { TrapdoorRotator } from "../../src/core/trapdoor-rotator";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";

const TEST_USER_ID = "test-user-id";

describe("TrapdoorRotator", () => {
  let rotator: TrapdoorRotator;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    rotator = new TrapdoorRotator(
      {
        rotationInterval: 24 * 60 * 60 * 1000, // 24 hours
        enableRotation: false, // Disable automatic rotation
      },
      defaultLogger
    );
    await rotator.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (rotator) {
      await rotator.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new TrapdoorRotator(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(TrapdoorRotator);
    });

    it("should create instance with custom config", () => {
      const instance = new TrapdoorRotator(
        {
          rotationInterval: 10000,
          enableRotation: false,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(TrapdoorRotator);
    });
  });

  describe("createTrapdoor", () => {
    it("should create trapdoor", async () => {
      const result = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("trapdoorId");
        expect(result.data).toHaveProperty("query");
      }
    });

    it("should create trapdoor with max usage", async () => {
      const result = await rotator.createTrapdoor(TEST_USER_ID, "test query", 10);
      expect(result.success).toBe(true);
    });
  });

  describe("rotateTrapdoor", () => {
    it("should rotate trapdoor", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      if (createResult.success) {
        const rotateResult = await rotator.rotateTrapdoor(
          createResult.data.trapdoorId,
          TEST_USER_ID
        );
        expect(rotateResult.success).toBe(true);
      }
    });
  });

  describe("revokeTrapdoor", () => {
    it("should revoke trapdoor", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      if (createResult.success) {
        await rotator.revokeTrapdoor(
          createResult.data.trapdoorId,
          "test reason"
        );
        // Should not throw
        expect(true).toBe(true);
      }
    });
  });

  describe("updateTrapdoorUsage", () => {
    it("should update trapdoor usage", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      if (createResult.success) {
        const updateResult = await rotator.updateTrapdoorUsage(
          createResult.data.trapdoorId
        );
        expect(updateResult.success).toBe(true);
      }
    });
  });

  describe("getTrapdoorInfo", () => {
    it("should get trapdoor info", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      if (createResult.success) {
        const info = rotator.getTrapdoorInfo(createResult.data.trapdoorId);
        expect(info).toBeDefined();
      }
    });
  });

  describe("getUserTrapdoors", () => {
    it("should get user trapdoors", () => {
      const result = rotator.getUserTrapdoors(TEST_USER_ID);
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("data");
      if (result.success && result.data) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });
  });

  describe("getRotationEvents", () => {
    it("should get rotation events", () => {
      const result = rotator.getRotationEvents();
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("data");
      if (result.success && result.data) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });

    it("should get rotation events with limit", () => {
      const result = rotator.getRotationEvents(10);
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("data");
      if (result.success && result.data) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });
  });
});
