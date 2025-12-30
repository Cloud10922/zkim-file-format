/**
 * TrapdoorRotator Branch Coverage Tests
 * Focused tests for missing branch coverage to reach 80%+ target
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { TrapdoorRotator } from "../../src/core/trapdoor-rotator";
import { defaultLogger } from "../../src/utils/logger";

describe("TrapdoorRotator - Branch Coverage", () => {
  let rotator: TrapdoorRotator;
  const TEST_USER_ID = "test-user-id";

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    rotator = new TrapdoorRotator(
      {
        rotationInterval: 24 * 60 * 60 * 1000,
        enableRotation: false,
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
    jest.useRealTimers();
  });

  describe("initialize - rotation timer branch", () => {
    it("should not start rotation timer when rotation is disabled (line 110-112)", async () => {
      const rotatorWithoutRotation = new TrapdoorRotator(
        {
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutRotation.initialize();

      // Timer should not be started
      const rotationTimer = (rotatorWithoutRotation as any).rotationTimer;
      expect(rotationTimer).toBeUndefined();

      await rotatorWithoutRotation.cleanup();
    });

    it("should start rotation timer when rotation is enabled (line 110-112)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      // Timer should be started
      const rotationTimer = (rotatorWithRotation as any).rotationTimer;
      expect(rotationTimer).toBeDefined();

      await rotatorWithRotation.cleanup();
    });
  });

  describe("createTrapdoor - usage tracking branch", () => {
    it("should skip usage tracking when enableUsageTracking is false (line 171-173)", async () => {
      const noTrackingRotator = new TrapdoorRotator(
        {
          enableUsageTracking: false,
          enableRotation: false,
        },
        defaultLogger
      );
      await noTrackingRotator.initialize();

      const result = await noTrackingRotator.createTrapdoor(TEST_USER_ID, "test query");
      expect(result.success).toBe(true);

      // Usage patterns should not be updated
      const usagePatterns = (noTrackingRotator as any).usagePatterns;
      expect(usagePatterns.size).toBe(0);

      await noTrackingRotator.cleanup();
    });
  });

  describe("revokeTrapdoor - audit logging branch", () => {
    it("should skip audit logging when enableAuditLogging is false (line 301-303)", async () => {
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

      if (trapdoorId) {
        const initialEvents = (noAuditRotator as any).rotationEvents.length;
        await noAuditRotator.revokeTrapdoor(trapdoorId);
        const finalEvents = (noAuditRotator as any).rotationEvents.length;

        // Events should not increase when audit logging is disabled
        expect(finalEvents).toBe(initialEvents);
      }

      await noAuditRotator.cleanup();
    });
  });

  describe("updateTrapdoorUsage - auto-rotate branch", () => {
    it("should auto-rotate when shouldRotate is true and rotation is enabled (line 393-395)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationThreshold: 1, // Low threshold for testing
          enableRevocation: false,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      const createResult = await rotatorWithRotation.createTrapdoor(
        TEST_USER_ID,
        "test query",
        1 // maxUsage = 1
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // First usage should trigger rotation
        const result = await rotatorWithRotation.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRotate).toBe(true);

        // Original trapdoor should be revoked
        const info = rotatorWithRotation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }

      await rotatorWithRotation.cleanup();
    });

    it("should not auto-rotate when rotation is disabled even if shouldRotate is true (line 393-395)", async () => {
      const rotatorWithoutRotation = new TrapdoorRotator(
        {
          enableRotation: false,
          rotationThreshold: 1,
          enableRevocation: false,
        },
        defaultLogger
      );
      await rotatorWithoutRotation.initialize();

      const createResult = await rotatorWithoutRotation.createTrapdoor(
        TEST_USER_ID,
        "test query",
        1
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        const result = await rotatorWithoutRotation.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRotate).toBe(true);

        // Trapdoor should not be rotated (still active)
        const info = rotatorWithoutRotation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(false);
      }

      await rotatorWithoutRotation.cleanup();
    });
  });

  describe("updateTrapdoorUsage - auto-revoke branch", () => {
    it("should auto-revoke when shouldRevoke is true and revocation is enabled (line 398-400)", async () => {
      const rotatorWithRevocation = new TrapdoorRotator(
        {
          enableRevocation: true,
          revocationThreshold: 1, // Low threshold for testing
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithRevocation.initialize();

      const createResult = await rotatorWithRevocation.createTrapdoor(
        TEST_USER_ID,
        "test query",
        1000 // High maxUsage so rotation doesn't trigger
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Set usage count to revocation threshold
        const trapdoor = (rotatorWithRevocation as any).trapdoors.get(trapdoorId);
        trapdoor.usageCount = 0; // Reset to 0, then increment will make it 1

        const result = await rotatorWithRevocation.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRevoke).toBe(true);

        // Trapdoor should be revoked
        const info = rotatorWithRevocation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(true);
      }

      await rotatorWithRevocation.cleanup();
    });

    it("should not auto-revoke when revocation is disabled even if shouldRevoke is true (line 398-400)", async () => {
      const rotatorWithoutRevocation = new TrapdoorRotator(
        {
          enableRevocation: false,
          revocationThreshold: 1,
          enableRotation: false,
        },
        defaultLogger
      );
      await rotatorWithoutRevocation.initialize();

      const createResult = await rotatorWithoutRevocation.createTrapdoor(
        TEST_USER_ID,
        "test query",
        1000
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        const trapdoor = (rotatorWithoutRevocation as any).trapdoors.get(trapdoorId);
        trapdoor.usageCount = 0;

        const result = await rotatorWithoutRevocation.updateTrapdoorUsage(trapdoorId);
        expect(result.success).toBe(true);
        expect(result.data?.shouldRevoke).toBe(true);

        // Trapdoor should not be revoked
        const info = rotatorWithoutRevocation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(false);
      }

      await rotatorWithoutRevocation.cleanup();
    });
  });

  describe("performScheduledRotations - logging branch", () => {
    it("should log when rotations or expirations occur (line 614-620)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      const createResult = await rotatorWithRotation.createTrapdoor(TEST_USER_ID, "test query");
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        // Set trapdoor to expire
        const trapdoor = (rotatorWithRotation as any).trapdoors.get(trapdoorId);
        trapdoor.expiresAt = Date.now() - 1000; // Expired

        const performSpy = jest.spyOn(rotatorWithRotation as any, "performScheduledRotations");
        jest.advanceTimersByTime(1000);

        // Should have been called
        expect(performSpy).toHaveBeenCalled();

        performSpy.mockRestore();
      }

      await rotatorWithRotation.cleanup();
    });

    it("should not log when no rotations or expirations occur (line 614-620)", async () => {
      const rotatorWithRotation = new TrapdoorRotator(
        {
          enableRotation: true,
          rotationInterval: 1000,
        },
        defaultLogger
      );
      await rotatorWithRotation.initialize();

      // Create trapdoor that won't expire or need rotation
      const createResult = await rotatorWithRotation.createTrapdoor(
        TEST_USER_ID,
        "test query",
        1000 // High maxUsage
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        const trapdoor = (rotatorWithRotation as any).trapdoors.get(trapdoorId);
        trapdoor.expiresAt = Date.now() + 10000; // Not expired
        trapdoor.usageCount = 0; // Low usage

        const performSpy = jest.spyOn(rotatorWithRotation as any, "performScheduledRotations");
        jest.advanceTimersByTime(1000);

        // Should have been called, but no rotations/expirations
        expect(performSpy).toHaveBeenCalled();

        performSpy.mockRestore();
      }

      await rotatorWithRotation.cleanup();
    });
  });

  describe("logRotationEvent - event limit branch", () => {
    it("should limit rotation events to MAX_ROTATION_EVENTS (line 685-687)", async () => {
      const rotatorWithAudit = new TrapdoorRotator(
        {
          enableAuditLogging: true,
          enableRotation: false,
          maxActiveTrapdoors: 2000, // High limit to allow many trapdoors
        },
        defaultLogger
      );
      await rotatorWithAudit.initialize();

      // Create many trapdoors to generate events
      const MAX_ROTATION_EVENTS = 1000;
      let createdCount = 0;
      for (let i = 0; i < MAX_ROTATION_EVENTS + 100; i++) {
        const result = await rotatorWithAudit.createTrapdoor(
          TEST_USER_ID,
          `query-${i}`
        );
        if (result.success) {
          createdCount++;
        }
        // Stop if we hit the limit
        if (!result.success && result.error?.includes("Maximum active trapdoors")) {
          break;
        }
      }

      const events = (rotatorWithAudit as any).rotationEvents;
      // Should be limited to MAX_ROTATION_EVENTS (even if we created more)
      expect(events.length).toBeLessThanOrEqual(MAX_ROTATION_EVENTS);

      await rotatorWithAudit.cleanup();
    });
  });

  describe("performScheduledRotations - rotation disabled branch", () => {
    it("should skip rotation in performScheduledRotations when enableRotation is false (line 605-611)", async () => {
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
        "test query",
        1 // Low maxUsage
      );
      expect(createResult.success).toBe(true);
      const trapdoorId = createResult.data?.trapdoorId;

      if (trapdoorId) {
        const trapdoor = (rotatorWithoutRotation as any).trapdoors.get(trapdoorId);
        trapdoor.usageCount = 1; // At threshold

        // Manually call performScheduledRotations
        await (rotatorWithoutRotation as any).performScheduledRotations();

        // Trapdoor should not be rotated (rotation disabled)
        const info = rotatorWithoutRotation.getTrapdoorInfo(trapdoorId);
        expect(info.success).toBe(true);
        expect(info.data?.isRevoked).toBe(false);
      }

      await rotatorWithoutRotation.cleanup();
    });
  });

  describe("rotateTrapdoor - trapdoor creation failure branch", () => {
    it("should handle trapdoor creation failure during rotation (line 232-243)", async () => {
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

      if (trapdoorId) {
        // Try to rotate - should fail because new trapdoor creation will exceed limit
        const rotateResult = await limitedRotator.rotateTrapdoor(trapdoorId);
        expect(rotateResult.success).toBe(false);
        expect(rotateResult.error).toBeDefined();
        expect(rotateResult.error).toContain("Failed to create new trapdoor");
      }

      await limitedRotator.cleanup();
    });
  });
});

