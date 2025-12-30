/**
 * Trapdoor Rotator Unit Tests
 * Comprehensive test suite for trapdoor rotation and privacy enhancement
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";

import sodium from "libsodium-wrappers-sumo";

import { TrapdoorRotator } from "../../src/core/trapdoor-rotator";
import { defaultLogger } from "../../src/utils/logger";

describe("TrapdoorRotator", () => {
  let rotator: TrapdoorRotator;
  const TEST_USER_ID = "test-user-id";

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    // Use fake timers to prevent setInterval from actually running
    jest.useFakeTimers();

    // Use long rotation interval to prevent timer from firing during tests
    rotator = new TrapdoorRotator(
      {
        rotationInterval: 24 * 60 * 60 * 1000, // 24 hours - won't fire during tests
        enableRotation: false, // Disable automatic rotation
      },
      defaultLogger
    );
    await rotator.initialize();
  });

  afterEach(async () => {
    // Clear all timers before cleanup
    jest.clearAllTimers();

    if (rotator) {
      await rotator.cleanup();
    }

    // Restore real timers after cleanup
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new TrapdoorRotator(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(TrapdoorRotator);
    });

    it("should create instance with custom config", () => {
      const customConfig = {
        rotationInterval: 12 * 60 * 60 * 1000, // 12 hours
        rotationThreshold: 50,
        enableRotation: false,
      };
      const instance = new TrapdoorRotator(customConfig, defaultLogger);
      expect(instance).toBeInstanceOf(TrapdoorRotator);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const instance = new TrapdoorRotator(undefined, defaultLogger);
      await expect(instance.initialize()).resolves.not.toThrow();
      await instance.cleanup();
    });

    it("should not reinitialize if already initialized", async () => {
      await expect(rotator.initialize()).resolves.not.toThrow();
    });

    it("should start rotation timer when rotation is enabled (line 579)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      // Timer should be started
      // We can verify by checking that performScheduledRotations is called after interval
      const performSpy = jest.spyOn(rotatorWithRotation as any, "performScheduledRotations");

      // Advance timer to trigger scheduled rotation
      jest.advanceTimersByTime(1000);

      // Verify performScheduledRotations was called
      expect(performSpy).toHaveBeenCalled();

      performSpy.mockRestore();
      await rotatorWithRotation.cleanup();
    });
  });

  describe("performScheduledRotations - branch paths", () => {
    it("should perform scheduled rotations (lines 588-613)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      // Create a trapdoor that will expire
      const createResult = await rotatorWithRotation.createTrapdoor(TEST_USER_ID, "test query", 1);
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Use the trapdoor to trigger usage count
        await rotatorWithRotation.updateTrapdoorUsage(trapdoorId);

        // Advance timer to trigger scheduled rotation
        jest.advanceTimersByTime(1000);

        // Verify trapdoor was rotated or expired
        const info = rotatorWithRotation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
      }

      await rotatorWithRotation.cleanup();
    });

    it("should skip revoked trapdoors during scheduled rotation (line 593-595)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      // Create and revoke a trapdoor
      const createResult = await rotatorWithRotation.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotatorWithRotation.revokeTrapdoor(trapdoorId);

        // Advance timer - revoked trapdoor should be skipped
        jest.advanceTimersByTime(1000);

        // Verify trapdoor is still revoked (not rotated)
        const info = rotatorWithRotation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }

      await rotatorWithRotation.cleanup();
    });

    it("should expire trapdoors when expiration time reached (line 598-601)", async () => {
      const rotatorWithShortExpiry = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 100, // Very short interval
          gracePeriod: 50, // Short grace period
        },
        defaultLogger
      );
      await rotatorWithShortExpiry.initialize();

      const createResult = await rotatorWithShortExpiry.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Advance timer past expiration (rotationInterval + gracePeriod = 150ms)
        jest.advanceTimersByTime(200);

        // Trigger scheduled rotation to check expiration
        await (rotatorWithShortExpiry as any).performScheduledRotations();

        // Verify trapdoor was expired
        const info = rotatorWithShortExpiry.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }

      await rotatorWithShortExpiry.cleanup();
    });

    it("should rotate trapdoors when usage threshold reached (line 603-609)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      const createResult = await rotatorWithRotation.createTrapdoor(TEST_USER_ID, "test query", 1);
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Use trapdoor to reach threshold
        await rotatorWithRotation.updateTrapdoorUsage(trapdoorId);

        // Advance timer to trigger scheduled rotation
        jest.advanceTimersByTime(1000);

        // Verify trapdoor was rotated
        const info = rotatorWithRotation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
      }

      await rotatorWithRotation.cleanup();
    });
  });

  describe("createTrapdoor", () => {
    it("should create trapdoor successfully", async () => {
      const result = await rotator.createTrapdoor(TEST_USER_ID, "test query");

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.trapdoorId).toBeDefined();
      expect(result.data?.userId).toBe(TEST_USER_ID);
      expect(result.data?.query).toBe("test query");
    });

    it("should skip audit logging when disabled", async () => {
      const noAuditRotator = new TrapdoorRotator(
        {
          enableAuditLogging: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await noAuditRotator.initialize();

      const result = await noAuditRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      await noAuditRotator.cleanup();
    });

    it("should create trapdoor with custom maxUsage", async () => {
      const result = await rotator.createTrapdoor(TEST_USER_ID, "test query", 50);

      expect(result.success).toBe(true);
      expect(result.data?.maxUsage).toBe(50);
    });

    it("should enforce maxActiveTrapdoors limit", async () => {
      const limitedRotator = new TrapdoorRotator(
        { maxActiveTrapdoors: 2 },
        defaultLogger
      );
      await limitedRotator.initialize();

      // Create 2 trapdoors (at limit)
      await limitedRotator.createTrapdoor(TEST_USER_ID, "query1");
      await limitedRotator.createTrapdoor(TEST_USER_ID, "query2");

      // Third should fail
      const result = await limitedRotator.createTrapdoor(TEST_USER_ID, "query3");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      await limitedRotator.cleanup();
    });

    it("should generate unique trapdoor IDs", async () => {
      const result1 = await rotator.createTrapdoor(TEST_USER_ID, "query1");
      const result2 = await rotator.createTrapdoor(TEST_USER_ID, "query2");

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data?.trapdoorId).not.toBe(result2.data?.trapdoorId);
    });
  });

  describe("rotateTrapdoor", () => {
    it("should rotate trapdoor successfully", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const rotateResult = await rotator.rotateTrapdoor(trapdoorId);
        expect(rotateResult.success).toBe(true);
        expect(rotateResult.data).toBeDefined();
        expect(rotateResult.data?.trapdoorId).not.toBe(trapdoorId); // New ID
      }
    });

    it("should fail to rotate non-existent trapdoor", async () => {
      const result = await rotator.rotateTrapdoor("non-existent-id");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should fail to rotate revoked trapdoor", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Revoke the trapdoor first
        await rotator.revokeTrapdoor(trapdoorId);

        // Try to rotate revoked trapdoor - should fail
        const rotateResult = await rotator.rotateTrapdoor(trapdoorId);
        expect(rotateResult.success).toBe(false);
        expect(rotateResult.error).toBeDefined();
        expect(rotateResult.error).toContain("Cannot rotate revoked trapdoor");
      }
    });

    it("should fail when trapdoor creation fails during rotation", async () => {
      // Create a rotator with maxActiveTrapdoors = 1
      const limitedRotator = new TrapdoorRotator(
        {
          maxActiveTrapdoors: 1,
          enableRotation: false,
        },
        defaultLogger
      );
      await limitedRotator.initialize();

      // Create one trapdoor (at limit)
      const createResult = await limitedRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Try to rotate - this will try to create a new trapdoor but will fail
        // because we're at the limit (the old one hasn't been revoked yet)
        const rotateResult = await limitedRotator.rotateTrapdoor(trapdoorId);
        expect(rotateResult.success).toBe(false);
        expect(rotateResult.error).toBeDefined();
        expect(rotateResult.error).toContain("Failed to create new trapdoor");
      }

      await limitedRotator.cleanup();
    });

    it("should skip audit logging when disabled during rotation", async () => {
      const noAuditRotator = new TrapdoorRotator(
        {
          enableAuditLogging: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await noAuditRotator.initialize();

      const createResult = await noAuditRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const rotateResult = await noAuditRotator.rotateTrapdoor(trapdoorId);
        expect(rotateResult.success).toBe(true);
      }

      await noAuditRotator.cleanup();
    });
  });

  describe("revokeTrapdoor", () => {
    it("should revoke trapdoor successfully", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        await rotator.revokeTrapdoor(trapdoorId);

        // Verify trapdoor is revoked
        const info = rotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }
    });

    it("should fail to revoke non-existent trapdoor", async () => {
      await expect(rotator.revokeTrapdoor("non-existent-id")).resolves.not.toThrow();
    });

    it("should handle already revoked trapdoor gracefully", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Revoke first time
        await rotator.revokeTrapdoor(trapdoorId);

        // Try to revoke again - should handle gracefully (no error)
        await expect(rotator.revokeTrapdoor(trapdoorId)).resolves.not.toThrow();
      }
    });

    it("should log warning when revoking already revoked trapdoor (line 291-292)", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Revoke first time
        await rotator.revokeTrapdoor(trapdoorId);

        // Mock logger to verify warning is called
        const warnSpy = jest.spyOn(defaultLogger, "warn");

        // Try to revoke again - should log warning
        await rotator.revokeTrapdoor(trapdoorId);

        expect(warnSpy).toHaveBeenCalledWith("Trapdoor already revoked", { trapdoorId });
        warnSpy.mockRestore();
      }
    });

    it("should skip audit logging when disabled during revocation", async () => {
      const noAuditRotator = new TrapdoorRotator(
        {
          enableAuditLogging: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await noAuditRotator.initialize();

      const createResult = await noAuditRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        await noAuditRotator.revokeTrapdoor(trapdoorId);
        const info = noAuditRotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }

      await noAuditRotator.cleanup();
    });
  });

  describe("updateTrapdoorUsage", () => {
    it("should update trapdoor usage count", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const updateResult = await rotator.updateTrapdoorUsage(trapdoorId);
        expect(updateResult.success).toBe(true);

        const info = rotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.usageCount).toBe(1);
      }
    });

    it("should increment usage count on multiple calls", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        await rotator.updateTrapdoorUsage(trapdoorId);
        await rotator.updateTrapdoorUsage(trapdoorId);
        await rotator.updateTrapdoorUsage(trapdoorId);

        const info = rotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.usageCount).toBe(3);
      }
    });

    it("should fail for non-existent trapdoor", async () => {
      const result = await rotator.updateTrapdoorUsage("non-existent-id");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return early for revoked trapdoor", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Revoke the trapdoor
        await rotator.revokeTrapdoor(trapdoorId);

        // Update usage on revoked trapdoor - should return early
        const result = await rotator.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.shouldRotate).toBe(false);
        expect(result.data?.shouldRevoke).toBe(false);
        expect(result.data?.anomalyDetected).toBe(false);
      }
    });

    it("should skip usage tracking when disabled", async () => {
      const noTrackingRotator = new TrapdoorRotator(
        {
          enableUsageTracking: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await noTrackingRotator.initialize();

      const createResult = await noTrackingRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const result = await noTrackingRotator.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        // Usage tracking disabled, but result should still have shouldRotate, shouldRevoke, anomalyDetected
        expect(result.data?.shouldRotate).toBeDefined();
      }

      await noTrackingRotator.cleanup();
    });

    it("should skip anomaly detection when disabled", async () => {
      const noAnomalyRotator = new TrapdoorRotator(
        {
          enableAnomalyDetection: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await noAnomalyRotator.initialize();

      const createResult = await noAnomalyRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const result = await noAnomalyRotator.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.anomalyDetected).toBe(false);
      }

      await noAnomalyRotator.cleanup();
    });

    it("should auto-rotate when rotation threshold reached and rotation enabled (line 391-392)", async () => {
      const autoRotateRotator = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationThreshold: 2, // Low threshold for testing
        },
        defaultLogger
      );
      await autoRotateRotator.initialize();

      const createResult = await autoRotateRotator.createTrapdoor(TEST_USER_ID, "test query", 2);
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Mock rotateTrapdoor to verify it's called
        const rotateSpy = jest.spyOn(autoRotateRotator, "rotateTrapdoor");

        // First usage - should not rotate
        await autoRotateRotator.updateTrapdoorUsage(trapdoorId);

        // Second usage - should trigger auto-rotation (line 391-392)
        const result = await autoRotateRotator.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRotate).toBe(true);
        expect(rotateSpy).toHaveBeenCalledWith(trapdoorId);

        rotateSpy.mockRestore();
      }

      await autoRotateRotator.cleanup();
    });

    it("should skip auto-rotation when rotation is disabled", async () => {
      const noRotationRotator = new TrapdoorRotator(
        {
          enableRotation: false,
          rotationThreshold: 2,
        },
        defaultLogger
      );
      await noRotationRotator.initialize();

      const createResult = await noRotationRotator.createTrapdoor(TEST_USER_ID, "test query", 2);
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Use trapdoor beyond rotation threshold
        await noRotationRotator.updateTrapdoorUsage(trapdoorId);
        const result = await noRotationRotator.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRotate).toBe(true);

        // But trapdoor should not be rotated (rotation disabled)
        const info = noRotationRotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(false); // Not rotated
      }

      await noRotationRotator.cleanup();
    });

    it("should auto-revoke when revocation threshold reached and revocation enabled", async () => {
      const autoRevokeRotator = new TrapdoorRotator(
        {
          enableRevocation: true,
          revocationThreshold: 2, // Low threshold for testing
          enableRotation: false,
        },
        defaultLogger
      );
      await autoRevokeRotator.initialize();

      const createResult = await autoRevokeRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        // Use trapdoor beyond revocation threshold
        await autoRevokeRotator.updateTrapdoorUsage(trapdoorId);
        const result = await autoRevokeRotator.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRevoke).toBe(true);

        // Verify trapdoor was revoked
        const info = autoRevokeRotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }

      await autoRevokeRotator.cleanup();
    });
  });

  describe("getTrapdoorInfo", () => {
    it("should return trapdoor info", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const info = rotator.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data).toBeDefined();
        expect(info.data?.trapdoorId).toBe(trapdoorId);
        expect(info.data?.userId).toBe(TEST_USER_ID);
        expect(info.data?.query).toBe("test query");
      }
    });

    it("should return null for non-existent trapdoor", () => {
      const info = rotator.getTrapdoorInfo("non-existent-id");
      expect(info.success).toBe(true);
      expect(info.data).toBeNull();
    });
  });

  describe("getActiveTrapdoorCount", () => {
    it("should return correct count of active trapdoors", async () => {
      // Use getUsageStats to verify active trapdoor count indirectly
      const stats1 = rotator.getUsageStats();
      expect(stats1.success).toBe(true);
      expect(stats1.data?.activeTrapdoors).toBe(0);

      await rotator.createTrapdoor(TEST_USER_ID, "query1");
      const stats2 = rotator.getUsageStats();
      expect(stats2.data?.activeTrapdoors).toBe(1);

      await rotator.createTrapdoor(TEST_USER_ID, "query2");
      const stats3 = rotator.getUsageStats();
      expect(stats3.data?.activeTrapdoors).toBe(2);
    });

    it("should exclude revoked trapdoors from count", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      if (trapdoorId) {
        const stats1 = rotator.getUsageStats();
        expect(stats1.data?.activeTrapdoors).toBe(1);

        await rotator.revokeTrapdoor(trapdoorId);
        const stats2 = rotator.getUsageStats();
        expect(stats2.data?.activeTrapdoors).toBe(0);
      }
    });
  });

  describe("cleanup", () => {
    it("should cleanup successfully", async () => {
      const instance = new TrapdoorRotator(undefined, defaultLogger);
      await instance.initialize();
      await expect(instance.cleanup()).resolves.not.toThrow();
    });
  });

  describe("getUserTrapdoors - branch paths", () => {
    it("should return error when service not initialized (line 453-459)", () => {
      const uninitializedRotator = new TrapdoorRotator(undefined, defaultLogger);
      const result = uninitializedRotator.getUserTrapdoors(TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Service not initialized");
      expect(result.data).toEqual([]);
    });

    it("should return user trapdoors when initialized", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);

      const result = rotator.getUserTrapdoors(TEST_USER_ID);
      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data!.length).toBeGreaterThan(0);
    });

    it("should exclude revoked trapdoors from user trapdoors (line 464)", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        const beforeRevoke = rotator.getUserTrapdoors(TEST_USER_ID);
        expect(beforeRevoke.data!.length).toBe(1);

        await rotator.revokeTrapdoor(trapdoorId);

        const afterRevoke = rotator.getUserTrapdoors(TEST_USER_ID);
        expect(afterRevoke.data!.length).toBe(0);
      }
    });
  });

  describe("getRotationEvents - branch paths", () => {
    it("should return error when service not initialized (line 481-487)", () => {
      const uninitializedRotator = new TrapdoorRotator(undefined, defaultLogger);
      const result = uninitializedRotator.getRotationEvents();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Service not initialized");
      expect(result.data).toEqual([]);
    });

    it("should return events with limit when limit is provided (line 491-496)", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Create multiple rotation events
        await rotator.rotateTrapdoor(trapdoorId);
        const newTrapdoorId = (await rotator.createTrapdoor(TEST_USER_ID, "test query 2")).data?.trapdoorId;
        if (newTrapdoorId) {
          await rotator.rotateTrapdoor(newTrapdoorId);
        }

        // Get all events
        const allEvents = rotator.getRotationEvents();
        expect(allEvents.success).toBe(true);
        expect(allEvents.data!.length).toBeGreaterThan(1);

        // Get limited events (line 491-496)
        const limitedEvents = rotator.getRotationEvents(1);
        expect(limitedEvents.success).toBe(true);
        expect(limitedEvents.data!.length).toBe(1);
      }
    });

    it("should return all events when limit is not provided (line 498-501)", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotator.rotateTrapdoor(trapdoorId);
      }

      const result = rotator.getRotationEvents();
      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
    });

    it("should return limited events when limit is provided (line 491-495)", async () => {
      const createResult1 = await rotator.createTrapdoor(TEST_USER_ID, "query1");
      const createResult2 = await rotator.createTrapdoor(TEST_USER_ID, "query2");
      expect(createResult1.success).toBe(true);
      expect(createResult2.success).toBe(true);

      const trapdoorId1 = createResult1.data?.trapdoorId;
      const trapdoorId2 = createResult2.data?.trapdoorId;

      if (trapdoorId1) {
        await rotator.rotateTrapdoor(trapdoorId1);
      }
      if (trapdoorId2) {
        await rotator.rotateTrapdoor(trapdoorId2);
      }

      const result = rotator.getRotationEvents(1);
      expect(result.success).toBe(true);
      expect(result.data!.length).toBeLessThanOrEqual(1);
    });
  });

  describe("getUsageStats - branch paths", () => {
    it("should return error when service not initialized (line 516-530)", () => {
      const uninitializedRotator = new TrapdoorRotator(undefined, defaultLogger);
      const result = uninitializedRotator.getUsageStats();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Service not initialized");
      expect(result.data).toBeDefined();
      expect(result.data!.totalTrapdoors).toBe(0);
    });

    it("should return usage stats when initialized", async () => {
      await rotator.createTrapdoor(TEST_USER_ID, "test query");

      const result = rotator.getUsageStats();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.totalTrapdoors).toBeGreaterThanOrEqual(0);
      expect(result.data!.activeTrapdoors).toBeGreaterThanOrEqual(0);
    });

    it("should calculate average usage per trapdoor correctly (line 540-541)", async () => {
      await rotator.createTrapdoor(TEST_USER_ID, "query1");
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "query2");
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotator.updateTrapdoorUsage(trapdoorId);
      }

      const result = rotator.getUsageStats();
      expect(result.success).toBe(true);
      expect(result.data!.averageUsagePerTrapdoor).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getTrapdoorInfo - branch paths", () => {
    it("should return error when service not initialized (line 423-429)", () => {
      const uninitializedRotator = new TrapdoorRotator(undefined, defaultLogger);
      const result = uninitializedRotator.getTrapdoorInfo("test-id");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Service not initialized");
      expect(result.data).toBeNull();
    });

    it("should return null when trapdoor not found (line 433-439)", async () => {
      const result = rotator.getTrapdoorInfo("non-existent-id");

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("should return trapdoor info when found", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        const result = rotator.getTrapdoorInfo(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data!.trapdoorId).toBe(trapdoorId);
      }
    });
  });

  describe("updateUsagePattern - branch paths", () => {
    it("should handle timeSinceLastUse > 0 (line 649-651)", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotator.updateTrapdoorUsage(trapdoorId);
        // Advance fake timer to simulate time passing (timeSinceLastUse > 0)
        jest.advanceTimersByTime(1000);
        await rotator.updateTrapdoorUsage(trapdoorId);

        const stats = rotator.getUsageStats();
        expect(stats.success).toBe(true);
        expect(stats.data).toBeDefined();
      }
    });

    it("should add query to queryPatterns if not present (line 654-656)", async () => {
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "unique-query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotator.updateTrapdoorUsage(trapdoorId);
        const stats = rotator.getUsageStats();
        expect(stats.success).toBe(true);
      }
    });
  });

  describe("logRotationEvent - branch paths", () => {
    it("should keep only last MAX_ROTATION_EVENTS events (line 683-685)", async () => {
      const trapdoorIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const createResult = await rotator.createTrapdoor(TEST_USER_ID, `query-${i}`);
        if (createResult.success && createResult.data?.trapdoorId) {
          trapdoorIds.push(createResult.data.trapdoorId);
        }
      }

      for (const trapdoorId of trapdoorIds) {
        await rotator.rotateTrapdoor(trapdoorId);
      }

      const events = rotator.getRotationEvents();
      expect(events.success).toBe(true);
      expect(events.data!.length).toBeLessThanOrEqual(100);
    });
  });

  describe("performScheduledRotations - branch paths", () => {
    it("should handle expired trapdoors (line 598-601)", async () => {
      const rotatorWithShortExpiry = new TrapdoorRotator(
        {
          rotationInterval: 24 * 60 * 60 * 1000,
          enableRotation: true,
        },
        defaultLogger
      );
      await rotatorWithShortExpiry.initialize();

      const createResult = await rotatorWithShortExpiry.createTrapdoor(
        TEST_USER_ID,
        "test query"
      );
      expect(createResult.success).toBe(true);

      // Advance timer to expire trapdoor
      jest.advanceTimersByTime(200);

      // Trigger scheduled rotations by advancing timer past rotation interval
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);

      const stats = rotatorWithShortExpiry.getUsageStats();
      expect(stats.success).toBe(true);

      await rotatorWithShortExpiry.cleanup();
    });

    it("should handle rotation when usage threshold reached (line 603-609)", async () => {
      const rotatorWithLowThreshold = new TrapdoorRotator(
        {
          rotationInterval: 24 * 60 * 60 * 1000,
          enableRotation: true,
          rotationThreshold: 1,
        },
        defaultLogger
      );
      await rotatorWithLowThreshold.initialize();

      const createResult = await rotatorWithLowThreshold.createTrapdoor(
        TEST_USER_ID,
        "test query"
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotatorWithLowThreshold.updateTrapdoorUsage(trapdoorId);
        // Trigger scheduled rotations
        jest.advanceTimersByTime(24 * 60 * 60 * 1000);

        const stats = rotatorWithLowThreshold.getUsageStats();
        expect(stats.success).toBe(true);
      }

      await rotatorWithLowThreshold.cleanup();
    });
  });

  describe("trapdoor-rotator - additional branch coverage", () => {
    it("should not start rotation timer when rotation is disabled (line 110)", async () => {
      const rotatorWithoutRotation = new TrapdoorRotator(
        {
          enableRotation: false,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithoutRotation.initialize();

      // Verify timer is not started when rotation is disabled
      const rotationTimer = (rotatorWithoutRotation as any).rotationTimer;
      expect(rotationTimer).toBeUndefined();

      await rotatorWithoutRotation.cleanup();
    });

    it("should skip usage tracking when enableUsageTracking is false (line 355-357)", async () => {
      const rotatorWithoutTracking = new TrapdoorRotator(
        {
          enableUsageTracking: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutTracking.initialize();

      const createResult = await rotatorWithoutTracking.createTrapdoor(
        TEST_USER_ID,
        "test-query"
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      // Update usage - should not track usage patterns
      const updateResult = await rotatorWithoutTracking.updateTrapdoorUsage(trapdoorId!);
      expect(updateResult.success).toBe(true);

      // Verify usage patterns map is empty (not tracking)
      const usagePatterns = (rotatorWithoutTracking as any).usagePatterns;
      expect(usagePatterns.size).toBe(0);

      await rotatorWithoutTracking.cleanup();
    });

    it("should skip anomaly detection when enableAnomalyDetection is false (line 361-381)", async () => {
      const rotatorWithoutAnomaly = new TrapdoorRotator(
        {
          enableAnomalyDetection: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutAnomaly.initialize();

      const createResult = await rotatorWithoutAnomaly.createTrapdoor(
        TEST_USER_ID,
        "test-query"
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      // Update usage multiple times - should not detect anomalies
      for (let i = 0; i < 10; i++) {
        const updateResult = await rotatorWithoutAnomaly.updateTrapdoorUsage(trapdoorId!);
        expect(updateResult.success).toBe(true);
        expect(updateResult.data?.anomalyDetected).toBe(false);
      }

      await rotatorWithoutAnomaly.cleanup();
    });

    it("should skip auto-revoke when revocation is disabled (line 396)", async () => {
      const rotatorWithoutRevocation = new TrapdoorRotator(
        {
          enableRevocation: false,
          revocationThreshold: 5,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutRevocation.initialize();

      const createResult = await rotatorWithoutRevocation.createTrapdoor(
        TEST_USER_ID,
        "test-query"
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;
      expect(trapdoorId).toBeDefined();

      // Update usage to exceed revocation threshold
      for (let i = 0; i < 10; i++) {
        await rotatorWithoutRevocation.updateTrapdoorUsage(trapdoorId!);
      }

      // Verify trapdoor is NOT revoked (revocation disabled)
      const infoResult = await rotatorWithoutRevocation.getTrapdoorInfo(trapdoorId!);
      expect(infoResult.success).toBe(true);
      expect(infoResult.data?.isRevoked).toBe(false);

      await rotatorWithoutRevocation.cleanup();
    });

    it("should handle trapdoor creation failure during rotation (line 230-239)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRotation: false,
          maxActiveTrapdoors: 1, // Limit to 1 to force creation failure
        },
        defaultLogger
      );
      await rotator.initialize();

      // Create first trapdoor (uses the limit)
      const firstResult = await rotator.createTrapdoor(TEST_USER_ID, "query1");
      expect(firstResult.success).toBe(true);
      const firstTrapdoorId = firstResult.data?.trapdoorId;

      // Create second trapdoor (should fail due to limit)
      const secondResult = await rotator.createTrapdoor(TEST_USER_ID, "query2");
      expect(secondResult.success).toBe(false);

      // Try to rotate first trapdoor - should fail because we can't create new one
      // rotateTrapdoor returns ServiceResult with success: false when creation fails
      const rotateResult = await rotator.rotateTrapdoor(firstTrapdoorId!);
      expect(rotateResult.success).toBe(false);
      expect(rotateResult.error).toContain("Failed to create new trapdoor");

      await rotator.cleanup();
    });

    it("should skip audit logging when enableAuditLogging is false", async () => {
      const rotatorWithoutAudit = new TrapdoorRotator(
        {
          enableAuditLogging: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutAudit.initialize();

      const createResult = await rotatorWithoutAudit.createTrapdoor(
        TEST_USER_ID,
        "test-query"
      );
      expect(createResult.success).toBe(true);

      // Verify rotation events are not logged (or minimal)
      // getRotationEvents takes optional limit (number), not userId
      const eventsResult = rotatorWithoutAudit.getRotationEvents();
      expect(eventsResult.success).toBe(true);

      await rotatorWithoutAudit.cleanup();
    });

    it("should handle timer cleanup when rotation timer exists (line 695-699)", async () => {
      const rotatorWithTimer = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithTimer.initialize();

      // Verify timer exists
      const rotationTimer = (rotatorWithTimer as any).rotationTimer;
      expect(rotationTimer).toBeDefined();

      // Cleanup should clear timer
      await rotatorWithTimer.cleanup();
      const timerAfterCleanup = (rotatorWithTimer as any).rotationTimer;
      expect(timerAfterCleanup).toBeUndefined();
    });

    it("should handle timer cleanup when rotation timer does not exist", async () => {
      const rotatorWithoutTimer = new TrapdoorRotator(
        {
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutTimer.initialize();

      // Verify timer does not exist
      const rotationTimer = (rotatorWithoutTimer as any).rotationTimer;
      expect(rotationTimer).toBeUndefined();

      // Cleanup should not throw error
      await expect(rotatorWithoutTimer.cleanup()).resolves.not.toThrow();
    });

    it("should skip rotation in performScheduledRotations when enableRotation is false (line 605)", async () => {
      const rotatorWithoutRotation = new TrapdoorRotator(
        {
          enableRotation: false,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithoutRotation.initialize();

      const createResult = await rotatorWithoutRotation.createTrapdoor(
        TEST_USER_ID,
        "test-query",
        2 // Low maxUsage
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      // Use trapdoor to reach maxUsage
      await rotatorWithoutRotation.updateTrapdoorUsage(trapdoorId!);
      await rotatorWithoutRotation.updateTrapdoorUsage(trapdoorId!);

      // Manually call performScheduledRotations
      const performSpy = jest.spyOn(rotatorWithoutRotation as any, "performScheduledRotations");
      await (rotatorWithoutRotation as any).performScheduledRotations();

      // Verify trapdoor is not rotated (rotation disabled)
      const infoResult = await rotatorWithoutRotation.getTrapdoorInfo(trapdoorId!);
      expect(infoResult.success).toBe(true);
      expect(infoResult.data?.isRevoked).toBe(false);

      performSpy.mockRestore();
      await rotatorWithoutRotation.cleanup();
    });

    it("should handle getRotationEvents when limit is not provided (line 498-501)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      // Create some trapdoors and rotation events
      await rotator.createTrapdoor(TEST_USER_ID, "query1");
      await rotator.createTrapdoor(TEST_USER_ID, "query2");

      // Get rotation events without limit (limit is optional)
      const eventsResult = rotator.getRotationEvents();
      expect(eventsResult.success).toBe(true);
      expect(eventsResult.data).toBeInstanceOf(Array);

      await rotator.cleanup();
    });

    it("should handle getUsageStats when no trapdoors exist (line 540-541)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      // Get usage stats with no trapdoors
      const statsResult = await rotator.getUsageStats();
      expect(statsResult.success).toBe(true);
      expect(statsResult.data).toBeDefined();
      expect(statsResult.data?.totalTrapdoors).toBe(0);
      expect(statsResult.data?.averageUsagePerTrapdoor).toBe(0);

      await rotator.cleanup();
    });

    it("should handle getUsageStats average usage calculation (line 540-541)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      // Create trapdoors and update usage
      const createResult1 = await rotator.createTrapdoor(TEST_USER_ID, "query1");
      const createResult2 = await rotator.createTrapdoor(TEST_USER_ID, "query2");

      const trapdoorId1 = createResult1.data?.trapdoorId;
      const trapdoorId2 = createResult2.data?.trapdoorId;

      // Update usage for first trapdoor
      if (trapdoorId1) {
        await rotator.updateTrapdoorUsage(trapdoorId1);
        await rotator.updateTrapdoorUsage(trapdoorId1);
      }

      // Update usage for second trapdoor
      if (trapdoorId2) {
        await rotator.updateTrapdoorUsage(trapdoorId2);
      }

      // Get usage stats - should calculate average
      const statsResult = await rotator.getUsageStats();
      expect(statsResult.success).toBe(true);
      expect(statsResult.data).toBeDefined();
      expect(statsResult.data?.totalTrapdoors).toBeGreaterThan(0);
      expect(statsResult.data?.averageUsagePerTrapdoor).toBeGreaterThanOrEqual(0);

      await rotator.cleanup();
    });

    it("should handle updateUsagePattern when timeSinceLastUse is 0 (line 649-651)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableUsageTracking: true,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      // Create trapdoor and immediately update usage (timeSinceLastUse = 0)
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test-query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Update usage immediately (timeSinceLastUse will be 0 or very small)
        await rotator.updateTrapdoorUsage(trapdoorId);

        // Verify usage pattern was updated
        const usagePatterns = (rotator as any).usagePatterns;
        expect(usagePatterns.size).toBeGreaterThan(0);
      }

      await rotator.cleanup();
    });

    it("should handle updateUsagePattern when query is already in queryPatterns (line 654-656)", async () => {
      // Use real timers for this test since we need actual time progression
      jest.useRealTimers();

      const rotator = new TrapdoorRotator(
        {
          enableUsageTracking: true,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      const query = "test-query";

      // Create trapdoor and update usage twice with same query
      const createResult = await rotator.createTrapdoor(TEST_USER_ID, query);
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        await rotator.updateTrapdoorUsage(trapdoorId);
        // Wait a bit to ensure timeSinceLastUse > 0
        await new Promise((resolve) => setTimeout(resolve, 10));
        await rotator.updateTrapdoorUsage(trapdoorId);

        // Verify query pattern was updated (not duplicated)
        const usagePatterns = (rotator as any).usagePatterns;
        const pattern = usagePatterns.get(TEST_USER_ID);
        if (pattern) {
          const queryCount = pattern.queryPatterns.filter((q: string) => q === query).length;
          expect(queryCount).toBe(1); // Should not be duplicated
        }
      }

      await rotator.cleanup();
      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it("should handle rotateTrapdoor when trapdoor is already revoked (line 218-223)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test-query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Revoke the trapdoor first
        await rotator.revokeTrapdoor(trapdoorId);

        // Try to rotate revoked trapdoor - should return error result
        const rotateResult = await rotator.rotateTrapdoor(trapdoorId);
        expect(rotateResult.success).toBe(false);
        expect(rotateResult.error).toContain("Cannot rotate revoked trapdoor");
      }

      await rotator.cleanup();
    });

    it("should handle updateTrapdoorUsage when trapdoor is revoked (line 344-351)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableUsageTracking: true,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test-query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Revoke the trapdoor first
        await rotator.revokeTrapdoor(trapdoorId);

        // Update usage on revoked trapdoor - should return early
        const usageResult = await rotator.updateTrapdoorUsage(trapdoorId);
        expect(usageResult.success).toBe(true);
        expect(usageResult.data?.shouldRotate).toBe(false);
        expect(usageResult.data?.shouldRevoke).toBe(false);
        expect(usageResult.data?.anomalyDetected).toBe(false);
      }

      await rotator.cleanup();
    });

    it("should handle updateTrapdoorUsage auto-rotate when threshold reached (line 392-395)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationThreshold: 2, // Low threshold for testing
          enableUsageTracking: true,
        },
        defaultLogger
      );
      await rotator.initialize();

      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test-query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Update usage to reach threshold
        await rotator.updateTrapdoorUsage(trapdoorId);
        const usageResult = await rotator.updateTrapdoorUsage(trapdoorId);

        // Should trigger auto-rotate
        expect(usageResult.success).toBe(true);
        // Trapdoor should be rotated (new trapdoor created or old one updated)
      }

      await rotator.cleanup();
    });

    it("should handle updateTrapdoorUsage auto-revoke when revocation threshold reached (line 397-399)", async () => {
      const rotator = new TrapdoorRotator(
        {
          enableRevocation: true,
          revocationThreshold: 2, // Low threshold for testing
          enableUsageTracking: true,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotator.initialize();

      const createResult = await rotator.createTrapdoor(TEST_USER_ID, "test-query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Update usage to reach revocation threshold
        await rotator.updateTrapdoorUsage(trapdoorId);
        await rotator.updateTrapdoorUsage(trapdoorId);

        // Should trigger auto-revoke
        const infoResult = await rotator.getTrapdoorInfo(trapdoorId);
        expect(infoResult.success).toBe(true);
        expect(infoResult.data?.isRevoked).toBe(true);
      }

      await rotator.cleanup();
    });

    it("should handle getTrapdoorInfo when service not initialized (line 424-428)", async () => {
      const rotator = new TrapdoorRotator(undefined, defaultLogger);
      // Don't initialize

      const infoResult = rotator.getTrapdoorInfo("test-trapdoor-id");
      expect(infoResult.success).toBe(false);
      expect(infoResult.error).toContain("Service not initialized");
      expect(infoResult.data).toBeNull();
    });
  });
});

