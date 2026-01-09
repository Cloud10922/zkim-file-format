/**
 * ZKIM Trapdoor Rotator Service - Privacy Enhancement and Key Rotation
 * Handles trapdoor rotation, revocation, and usage tracking for enhanced privacy
 * 
 * Service Flow:
 * 1. Manage trapdoor lifecycle and rotation schedules
 * 2. Implement automatic revocation and expiration
 * 3. Track usage patterns and detect anomalies
 * 4. Provide privacy metrics and audit logging
 */

// libsodium-wrappers-sumo uses default export, not namespace export
import sodium from "libsodium-wrappers-sumo";

import { ErrorUtils } from "../utils/error-handling";
import { ServiceBase } from "../utils/singleton-base";

import { ServiceError, ServiceResult } from "../types/errors";

import { defaultLogger, type ILogger } from "../utils/logger";

import {
  AnomalyDetector,
  type Trapdoor,
  type TrapdoorRotationConfig,
  type TrapdoorRotationEvent,
  type UsagePattern,
} from "../types/zkim-file-format";

// TrapdoorRotatorServiceConfig extends TrapdoorRotationConfig with additional fields
export interface TrapdoorRotatorServiceConfig extends TrapdoorRotationConfig {
  enableAnomalyDetection: boolean;
  enableAuditLogging: boolean;
  rotationThreshold: number;
  revocationThreshold: number;
}

// Simple timer wrapper for cross-platform compatibility
type CrossPlatformTimer = ReturnType<typeof setInterval>;

function setCrossPlatformInterval(
  callback: () => void,
  delay: number
): CrossPlatformTimer {
  return setInterval(callback, delay);
}

function clearCrossPlatformInterval(timer: CrossPlatformTimer): void {
  clearInterval(timer);
}


// Trapdoor Rotator Constants
const TRAPDOOR_ID_BYTES = 16;
const EVENT_ID_BYTES = 6;
const EVENT_ID_LENGTH = 9;
const MAX_ROTATION_EVENTS = 1000;

export class TrapdoorRotator extends ServiceBase {
  private readonly defaultConfig: TrapdoorRotatorServiceConfig = {
    enableRotation: true,
    rotationInterval: 24 * 60 * 60 * 1000, // 24 hours
    gracePeriod: 60 * 60 * 1000, // 1 hour
    enableRevocation: true,
    maxActiveTrapdoors: 1000,
    enableUsageTracking: true,
    enableAnomalyDetection: true,
    enableAuditLogging: true,
    rotationThreshold: 100, // Rotate after 100 uses
    revocationThreshold: 1000, // Revoke after 1000 uses
  };

  private config: TrapdoorRotatorServiceConfig;
  private trapdoors: Map<string, Trapdoor> = new Map();
  private rotationEvents: TrapdoorRotationEvent[] = [];
  private usagePatterns: Map<string, UsagePattern> = new Map();
  private rotationTimer?: CrossPlatformTimer;
  private anomalyDetector: AnomalyDetector = new AnomalyDetector();
  private logger: ILogger;

  public constructor(
    config?: Partial<TrapdoorRotatorServiceConfig>,
    logger: ILogger = defaultLogger
  ) {
    super();
    this.config = { ...this.defaultConfig, ...config };
    this.logger = logger;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const context = ErrorUtils.createContext("TrapdoorRotator", "initialize", {
      severity: "high",
    });

    await ErrorUtils.withErrorHandling(async () => {
      await sodium.ready;

      this.logger.info("Initializing ZKIM Trapdoor Rotator Service", {
        config: this.config,
      });

      // Initialize rotation system
      this.initializeRotationSystem();

      // Start rotation timer only if rotation is enabled
      // Tests use jest.useFakeTimers() to prevent real timers from running
      if (this.config.enableRotation) {
        this.startRotationTimer();
      }

      this.initialized = true;
      this.logger.info("ZKIM Trapdoor Rotator Service initialized successfully");
    }, context);
  }

  /**
   * Create a new trapdoor
   */
  public async createTrapdoor(
    userId: string,
    query: string,
    maxUsage?: number
  ): Promise<ServiceResult<Trapdoor>> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "TrapdoorRotator",
      "createTrapdoor",
      {
        severity: "medium",
        userId,
      }
    );

    return await ErrorUtils.withErrorHandling(async () => {
      // Check active trapdoor limit
      if (this.getActiveTrapdoorCount() >= this.config.maxActiveTrapdoors) {
        throw new ServiceError(
          `Maximum active trapdoors (${this.config.maxActiveTrapdoors}) exceeded`,
          {
            code: "MAX_TRAPDOORS_EXCEEDED",
            details: {
              maxActiveTrapdoors: this.config.maxActiveTrapdoors,
              currentCount: this.getActiveTrapdoorCount(),
            },
          }
        );
      }

      const trapdoorId = this.generateTrapdoorId();
      const now = Date.now();

      const trapdoor: Trapdoor = {
        trapdoorId,
        userId,
        query,
        epoch: Math.floor(now / this.config.rotationInterval),
        expiresAt: now + this.config.rotationInterval + this.config.gracePeriod,
        usageCount: 0,
        maxUsage: maxUsage ?? this.config.rotationThreshold,
        isRevoked: false,
      };

      // Add to trapdoors map
      this.trapdoors.set(trapdoorId, trapdoor);

      // Update usage patterns
      if (this.config.enableUsageTracking) {
        this.updateUsagePattern(userId, query);
      }

      // Log creation event
      if (this.config.enableAuditLogging) {
        this.logRotationEvent(trapdoorId, userId, "created");
      }

      this.logger.info("Trapdoor created successfully", {
        trapdoorId,
        userId,
        query,
        maxUsage: trapdoor.maxUsage,
        expiresAt: new Date(trapdoor.expiresAt).toISOString(),
      });

      await Promise.resolve(); // Satisfy async requirement
      return trapdoor;
    }, context);
  }

  /**
   * Rotate an existing trapdoor
   */
  public async rotateTrapdoor(
    trapdoorId: string
  ): Promise<ServiceResult<Trapdoor>> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "TrapdoorRotator",
      "rotateTrapdoor",
      {
        severity: "medium",
      }
    );

    return await ErrorUtils.withErrorHandling(async () => {
      const trapdoor = this.trapdoors.get(trapdoorId);
      if (!trapdoor) {
        throw new ServiceError(`Trapdoor not found: ${trapdoorId}`, {
          code: "TRAPDOOR_NOT_FOUND",
          details: { trapdoorId },
        });
      }

      if (trapdoor.isRevoked) {
        throw new ServiceError(`Cannot rotate revoked trapdoor: ${trapdoorId}`, {
          code: "TRAPDOOR_REVOKED",
          details: { trapdoorId },
        });
      }

      // Create new trapdoor with same parameters
      const newTrapdoorResult = await this.createTrapdoor(
        trapdoor.userId,
        trapdoor.query,
        trapdoor.maxUsage
      );

      if (!newTrapdoorResult.success || !newTrapdoorResult.data) {
        throw new ServiceError(
          `Failed to create new trapdoor: ${newTrapdoorResult.error ?? "Unknown error"}`,
          {
            code: "TRAPDOOR_CREATION_FAILED",
            details: {
              trapdoorId,
              error: newTrapdoorResult.error,
            },
          }
        );
      }

      const newTrapdoor = newTrapdoorResult.data;

      // Revoke old trapdoor
      trapdoor.isRevoked = true;

      // Log rotation event
      if (this.config.enableAuditLogging) {
        this.logRotationEvent(trapdoorId, trapdoor.userId, "rotated");
      }

      this.logger.info("Trapdoor rotated successfully", {
        oldTrapdoorId: trapdoorId,
        newTrapdoorId: newTrapdoor.trapdoorId,
        userId: trapdoor.userId,
        usageCount: trapdoor.usageCount,
      });

      return newTrapdoor;
    }, context);
  }

  /**
   * Revoke a trapdoor
   */
  public async revokeTrapdoor(
    trapdoorId: string,
    reason?: string
  ): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "TrapdoorRotator",
      "revokeTrapdoor",
      {
        severity: "medium",
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      const trapdoor = this.trapdoors.get(trapdoorId);
      if (!trapdoor) {
        throw new ServiceError(`Trapdoor not found: ${trapdoorId}`, {
          code: "TRAPDOOR_NOT_FOUND",
          details: { trapdoorId },
        });
      }

      if (trapdoor.isRevoked) {
        this.logger.warn("Trapdoor already revoked", { trapdoorId });
        return;
      }

      // Revoke trapdoor
      trapdoor.isRevoked = true;

      // Log revocation event
      if (this.config.enableAuditLogging) {
        this.logRotationEvent(trapdoorId, trapdoor.userId, "revoked", reason);
      }

      this.logger.info("Trapdoor revoked", {
        trapdoorId,
        userId: trapdoor.userId,
        reason: reason ?? "Manual revocation",
        usageCount: trapdoor.usageCount,
      });

      await Promise.resolve(); // Satisfy async requirement
    }, context);
  }

  /**
   * Update trapdoor usage
   */
  public async updateTrapdoorUsage(trapdoorId: string): Promise<
    ServiceResult<{
      shouldRotate: boolean;
      shouldRevoke: boolean;
      anomalyDetected: boolean;
    }>
  > {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "TrapdoorRotator",
      "updateTrapdoorUsage",
      {
        severity: "low",
      }
    );

    return await ErrorUtils.withErrorHandling(async () => {
      const trapdoor = this.trapdoors.get(trapdoorId);
      if (!trapdoor) {
        throw new ServiceError(`Trapdoor not found: ${trapdoorId}`, {
          code: "TRAPDOOR_NOT_FOUND",
          details: { trapdoorId },
        });
      }

      if (trapdoor.isRevoked) {
        return {
          shouldRotate: false,
          shouldRevoke: false,
          anomalyDetected: false,
        };
      }

      // Increment usage count
      trapdoor.usageCount++;

      // Update usage patterns
      if (this.config.enableUsageTracking) {
        this.updateUsagePattern(trapdoor.userId, trapdoor.query);
      }

      // Check for anomalies
      let anomalyDetected = false;
      if (this.config.enableAnomalyDetection) {
        const usagePattern = this.usagePatterns.get(trapdoor.userId);
        if (usagePattern) {
          const anomaly = this.anomalyDetector.detectAnomaly(
            usagePattern,
            trapdoor.usageCount
          );

          if (anomaly.isAnomaly) {
            anomalyDetected = true;
            usagePattern.anomalyScore = anomaly.score;

            this.logger.warn("Anomaly detected in trapdoor usage", {
              trapdoorId,
              userId: trapdoor.userId,
              anomalyScore: anomaly.score,
              reason: anomaly.reason,
            });
          }
        }
      }

      // Check rotation threshold
      const shouldRotate = trapdoor.usageCount >= trapdoor.maxUsage;

      // Check revocation threshold
      const shouldRevoke =
        trapdoor.usageCount >= this.config.revocationThreshold;

      // Auto-rotate if threshold reached
      if (shouldRotate && this.config.enableRotation) {
        await this.rotateTrapdoor(trapdoorId);
      }

      // Auto-revoke if revocation threshold reached
      if (shouldRevoke && this.config.enableRevocation) {
        await this.revokeTrapdoor(trapdoorId, "Usage threshold exceeded");
      }

      this.logger.info("Trapdoor usage updated", {
        trapdoorId,
        userId: trapdoor.userId,
        usageCount: trapdoor.usageCount,
        shouldRotate,
        shouldRevoke,
        anomalyDetected,
      });

      return {
        shouldRotate,
        shouldRevoke,
        anomalyDetected,
      };
    }, context);
  }

  /**
   * Get trapdoor information
   */
  public getTrapdoorInfo(
    trapdoorId: string
  ): ServiceResult<Trapdoor | null> {
    if (!this.initialized) {
      return {
        success: false,
        error: "Service not initialized",
        data: null,
      };
    }

    const trapdoor = this.trapdoors.get(trapdoorId);

    if (!trapdoor) {
      this.logger.warn("Trapdoor not found", { trapdoorId });
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: trapdoor,
    };
  }

  /**
   * Get user's active trapdoors
   */
  public getUserTrapdoors(
    userId: string
  ): ServiceResult<Trapdoor[]> {
    if (!this.initialized) {
      return {
        success: false,
        error: "Service not initialized",
        data: [],
      };
    }

    const userTrapdoors: Trapdoor[] = [];

    for (const trapdoor of Array.from(this.trapdoors.values())) {
      if (trapdoor.userId === userId && !trapdoor.isRevoked) {
        userTrapdoors.push(trapdoor);
      }
    }

    return {
      success: true,
      data: userTrapdoors,
    };
  }

  /**
   * Get rotation events
   */
  public getRotationEvents(
    limit?: number
  ): ServiceResult<TrapdoorRotationEvent[]> {
    if (!this.initialized) {
      return {
        success: false,
        error: "Service not initialized",
        data: [],
      };
    }

    const events = [...this.rotationEvents];

    if (limit) {
      return {
        success: true,
        data: events.slice(-limit),
      };
    }

    return {
      success: true,
      data: events,
    };
  }

  /**
   * Get usage statistics
   */
  public getUsageStats(): ServiceResult<{
    totalTrapdoors: number;
    activeTrapdoors: number;
    revokedTrapdoors: number;
    averageUsagePerTrapdoor: number;
    totalRotations: number;
    totalRevocations: number;
    anomalyCount: number;
  }> {
    if (!this.initialized) {
      return {
        success: false,
        error: "Service not initialized",
        data: {
          totalTrapdoors: 0,
          activeTrapdoors: 0,
          revokedTrapdoors: 0,
          averageUsagePerTrapdoor: 0,
          totalRotations: 0,
          totalRevocations: 0,
          anomalyCount: 0,
        },
      };
    }

    const totalTrapdoors = this.trapdoors.size;
    const activeTrapdoors = this.getActiveTrapdoorCount();
    const revokedTrapdoors = totalTrapdoors - activeTrapdoors;

    const totalUsage = Array.from(this.trapdoors.values()).reduce(
      (sum, t) => sum + t.usageCount,
      0
    );
    const averageUsagePerTrapdoor =
      totalTrapdoors > 0 ? totalUsage / totalTrapdoors : 0;

    const totalRotations = this.rotationEvents.filter(
      (e) => e.eventType === "rotated"
    ).length;
    const totalRevocations = this.rotationEvents.filter(
      (e) => e.eventType === "revoked"
    ).length;

    const anomalyCount = Array.from(this.usagePatterns.values()).filter(
      (p) => p.anomalyScore > 0
    ).length;

    return {
      success: true,
      data: {
        totalTrapdoors,
        activeTrapdoors,
        revokedTrapdoors,
        averageUsagePerTrapdoor,
        totalRotations,
        totalRevocations,
        anomalyCount,
      },
    };
  }

  // ===== PRIVATE HELPER METHODS =====

  private initializeRotationSystem(): void {
    // Initialize rotation system
    // This will be enhanced in Phase 2 with advanced rotation algorithms
    this.logger.info("Rotation system initialized");
  }

  private startRotationTimer(): void {
    // CRITICAL: Never create timers in test environment
    // Simple inline check - no dynamic imports that could fail
    if (
      (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
      typeof jest !== "undefined"
    ) {
      this.logger.debug("Rotation timer skipped in test environment");
      return;
    }

    // Start rotation timer
    this.rotationTimer = setCrossPlatformInterval(() => {
      this.performScheduledRotations();
    }, this.config.rotationInterval);

    this.logger.info("Rotation timer started", {
      rotationInterval: this.config.rotationInterval,
    });
  }

  private async performScheduledRotations(): Promise<void> {
    const now = Date.now();
    let rotatedCount = 0;
    let expiredCount = 0;

    for (const [trapdoorId, trapdoor] of Array.from(this.trapdoors.entries())) {
      if (trapdoor.isRevoked) {
        continue;
      }

      // Check if trapdoor has expired
      if (now >= trapdoor.expiresAt) {
        await this.revokeTrapdoor(trapdoorId, "Expired");
        expiredCount++;
      }
      // Check if trapdoor needs rotation
      else if (
        trapdoor.usageCount >= trapdoor.maxUsage &&
        this.config.enableRotation
      ) {
        await this.rotateTrapdoor(trapdoorId);
        rotatedCount++;
      }
    }

    if (rotatedCount > 0 || expiredCount > 0) {
      this.logger.info("Scheduled rotations completed", {
        rotatedCount,
        expiredCount,
        totalTrapdoors: this.trapdoors.size,
      });
    }
  }

  private generateTrapdoorId(): string {
    const randomBytes = sodium.randombytes_buf(TRAPDOOR_ID_BYTES);
    return sodium.to_base64(randomBytes);
  }

  private getActiveTrapdoorCount(): number {
    return Array.from(this.trapdoors.values()).filter((t) => !t.isRevoked)
      .length;
  }

  private updateUsagePattern(userId: string, query: string): void {
    let pattern = this.usagePatterns.get(userId);

    if (!pattern) {
      pattern = {
        userId,
        queryPatterns: [],
        usageFrequency: 0,
        lastUsed: Date.now(),
        totalUsage: 0,
        anomalyScore: 0,
      };
      this.usagePatterns.set(userId, pattern);
    }

    // Update usage frequency
    const now = Date.now();
    const timeSinceLastUse = now - pattern.lastUsed;
    if (timeSinceLastUse > 0) {
      pattern.usageFrequency = 1 / (timeSinceLastUse / 1000); // Uses per second
    }

    // Update query patterns
    if (!pattern.queryPatterns.includes(query)) {
      pattern.queryPatterns.push(query);
    }

    pattern.lastUsed = now;
    pattern.totalUsage++;
  }

  private logRotationEvent(
    trapdoorId: string,
    userId: string,
    eventType: "created" | "rotated" | "revoked" | "expired",
    reason?: string
  ): void {
    // Sodium is already ready after initialization, no need to await again
    const randomBytes = sodium.randombytes_buf(EVENT_ID_BYTES);
    const randomId = sodium.to_base64(randomBytes).replace(/[+/=]/g, '').substring(0, EVENT_ID_LENGTH);
    const event: TrapdoorRotationEvent = {
      eventId: `event_${Date.now()}_${randomId}`,
      userId,
      trapdoorId,
      eventType,
      timestamp: Date.now(),
      metadata: reason ? { reason } : undefined,
    };

    this.rotationEvents.push(event);

    // Keep only last MAX_ROTATION_EVENTS events
    if (this.rotationEvents.length > MAX_ROTATION_EVENTS) {
      this.rotationEvents = this.rotationEvents.slice(-MAX_ROTATION_EVENTS);
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext("TrapdoorRotator", "cleanup", {
      severity: "low",
    });

    await ErrorUtils.withErrorHandling(async () => {
      // Always clear rotation timer - idempotent cleanup
      try {
        if (this.rotationTimer) {
          clearCrossPlatformInterval(this.rotationTimer);
          this.rotationTimer = undefined;
        }
      } catch {
        // Ignore errors clearing timer - ensure we continue cleanup
        this.rotationTimer = undefined;
      }

      // Clear all data structures
      this.trapdoors.clear();
      this.rotationEvents = [];
      this.usagePatterns.clear();
      
      // CRITICAL: Reset initialized state to allow re-initialization
      this.initialized = false;

      this.logger.info("ZKIM Trapdoor Rotator Service cleaned up");
    }, context);
  }
}

// Use TrapdoorRotator.getServiceInstance() instead of direct instantiation
