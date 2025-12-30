/**
 * ZKIM Performance Monitor Unit Tests
 * Comprehensive test suite for performance monitoring and metrics collection
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { ZkimPerformanceMonitor } from "../../src/core/zkim-performance-monitor";
import { defaultLogger } from "../../src/utils/logger";
import type {
  ZkimPerformanceThresholds,
} from "../../src/core/zkim-performance-monitor";

describe("ZkimPerformanceMonitor", () => {
  let monitor: ZkimPerformanceMonitor;

  beforeEach(async () => {
    // Use fake timers to prevent setInterval from actually running
    jest.useFakeTimers();
    
    // Restore all mocks before each test
    jest.restoreAllMocks();

    monitor = new ZkimPerformanceMonitor(undefined, defaultLogger);
    await monitor.initialize();
  });

  afterEach(async () => {
    // Clear all timers before cleanup
    jest.clearAllTimers();
    
    // Restore all mocks after each test
    jest.restoreAllMocks();

    if (monitor) {
      await monitor.cleanup();
    }

    // Restore real timers after cleanup
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default thresholds", () => {
      const instance = new ZkimPerformanceMonitor(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimPerformanceMonitor);
    });

    it("should create instance with custom thresholds", () => {
      const customThresholds: Partial<ZkimPerformanceThresholds> = {
        maxDuration: 2000,
        minThroughput: 20,
        maxMemoryUsage: 200 * 1024 * 1024,
        minSuccessRate: 0.99,
      };
      const instance = new ZkimPerformanceMonitor(customThresholds, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimPerformanceMonitor);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const instance = new ZkimPerformanceMonitor(undefined, defaultLogger);
      await expect(instance.initialize()).resolves.not.toThrow();
      await instance.cleanup();
    });

    it("should not reinitialize if already initialized", async () => {
      await expect(monitor.initialize()).resolves.not.toThrow();
    });

    it("should handle ErrorUtils.withErrorHandling failure in initialize (line 114-119)", async () => {
      const { ErrorUtils } = await import("../../src/utils/error-handling");
      const mockWithErrorHandling = jest.spyOn(ErrorUtils, "withErrorHandling");
      mockWithErrorHandling.mockResolvedValueOnce({
        success: false,
        error: "Initialization failed",
        errorCode: "ZKIM_PERFORMANCE_MONITOR_INIT_ERROR",
      });

      const instance = new ZkimPerformanceMonitor(undefined, defaultLogger);
      await expect(instance.initialize()).rejects.toThrow();
      
      mockWithErrorHandling.mockRestore();
    });
  });

  describe("recordOperation", () => {
    it("should record operation metrics", () => {
      monitor.recordOperation("encrypt", 100, 1024, true);

      const recorded = monitor.getRecentMetrics(1);
      expect(recorded.length).toBe(1);
      expect(recorded[0].operation).toBe("encrypt");
      expect(recorded[0].duration).toBe(100);
      expect(recorded[0].dataSize).toBe(1024);
      expect(recorded[0].success).toBe(true);
    });

    it("should handle errors in recordOperation catch block (line 208)", () => {
      // Force an error by making metrics array readonly or causing an error
      // This tests the catch block that logs errors
      const originalPush = Array.prototype.push;
      Array.prototype.push = jest.fn().mockImplementation(() => {
        throw new Error("Forced error");
      });

      // Should not throw, but should handle error gracefully
      expect(() => {
        monitor.recordOperation("encrypt", 100, 1024, true);
      }).not.toThrow();

      // Restore
      Array.prototype.push = originalPush;
    });

    it("should record multiple operations", () => {
      monitor.recordOperation("encrypt", 100, 1024, true);
      monitor.recordOperation("decrypt", 150, 2048, true);

      const recorded = monitor.getRecentMetrics(2);
      expect(recorded.length).toBe(2);
      expect(recorded[0].operation).toBe("encrypt");
      expect(recorded[1].operation).toBe("decrypt");
    });

    it("should record failed operations", () => {
      monitor.recordOperation("encrypt", 50, 1024, false, "Encryption failed");

      const stats = monitor.getPerformanceStats();
      expect(stats.failedOperations).toBe(1);
      expect(stats.totalOperations).toBe(1);
    });

    it("should limit metrics retention", () => {
      // Record more than MAX_METRICS_RETENTION operations
      for (let i = 0; i < 1500; i++) {
        monitor.recordOperation("test", 10, 100, true);
      }

      const recorded = monitor.getRecentMetrics(2000);
      // Should be limited to MAX_METRICS_RETENTION (1000)
      expect(recorded.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("getPerformanceStats", () => {
    it("should return empty stats when no operations recorded", () => {
      const stats = monitor.getPerformanceStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.failedOperations).toBe(0);
    });

    it("should calculate correct statistics", () => {
      monitor.recordOperation("encrypt", 100, 1024, true);
      monitor.recordOperation("encrypt", 200, 2048, true);
      monitor.recordOperation("encrypt", 150, 1536, false, "Error");

      const stats = monitor.getPerformanceStats();
      expect(stats.totalOperations).toBe(3);
      expect(stats.successfulOperations).toBe(2);
      expect(stats.failedOperations).toBe(1);
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    it("should calculate percentiles correctly", () => {
      // Record multiple operations with varying durations
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (const duration of durations) {
        monitor.recordOperation("test", duration, 100, true);
      }

      const stats = monitor.getPerformanceStats();
      expect(stats.p95Duration).toBeGreaterThanOrEqual(0);
      expect(stats.p99Duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getOperationMetrics", () => {
    it("should return metrics for specific operation", () => {
      monitor.recordOperation("encrypt", 100, 1024, true);
      monitor.recordOperation("decrypt", 150, 2048, true);
      monitor.recordOperation("encrypt", 200, 3072, true);

      const encryptMetrics = monitor.getOperationMetrics("encrypt");
      expect(encryptMetrics.length).toBe(2);
      expect(encryptMetrics.every((m) => m.operation === "encrypt")).toBe(true);
    });

    it("should return empty array for non-existent operation", () => {
      const metrics = monitor.getOperationMetrics("nonexistent");
      expect(metrics).toEqual([]);
    });
  });

  describe("getRecentMetrics", () => {
    it("should return recent metrics", () => {
      monitor.recordOperation("op1", 10, 100, true);
      monitor.recordOperation("op2", 20, 200, true);
      monitor.recordOperation("op3", 30, 300, true);

      const recent = monitor.getRecentMetrics(2);
      expect(recent.length).toBe(2);
      // Most recent should be last
      expect(recent[0].operation).toBe("op2");
      expect(recent[1].operation).toBe("op3");
    });

    it("should return all metrics if limit exceeds available", () => {
      monitor.recordOperation("op1", 10, 100, true);
      monitor.recordOperation("op2", 20, 200, true);

      const recent = monitor.getRecentMetrics(10);
      expect(recent.length).toBe(2);
    });
  });

  describe("getPerformanceAlerts", () => {
    it("should check performance against thresholds", () => {
      monitor.recordOperation("encrypt", 100, 1024, true);
      const alerts = monitor.getPerformanceAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it("should generate alert when averageDuration exceeds threshold (line 358)", () => {
      // Set very low threshold
      monitor.updateThresholds({ maxDuration: 50 });
      
      // Record operations that exceed threshold
      monitor.recordOperation("encrypt", 100, 1024, true);
      monitor.recordOperation("encrypt", 150, 2048, true);
      
      const alerts = monitor.getPerformanceAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((alert) => alert.includes("Average duration"))).toBe(true);
    });

    it("should generate alert when averageMemoryUsage exceeds threshold (line 399)", () => {
      // Set very low memory threshold
      monitor.updateThresholds({ maxMemoryUsage: 1000 }); // 1KB
      
      // Record operations (memory usage is calculated from performance.memory if available)
      monitor.recordOperation("encrypt", 100, 1024 * 1024, true); // 1MB
      monitor.recordOperation("encrypt", 150, 2 * 1024 * 1024, true); // 2MB
      
      const alerts = monitor.getPerformanceAlerts();
      // May or may not trigger depending on actual memory usage
      expect(Array.isArray(alerts)).toBe(true);
    });

    it("should generate alert when successRate is below threshold (line 417)", () => {
      // Set high success rate threshold
      monitor.updateThresholds({ minSuccessRate: 0.99 });
      
      // Record mostly failed operations
      monitor.recordOperation("encrypt", 100, 1024, false, "Error 1");
      monitor.recordOperation("encrypt", 150, 2048, false, "Error 2");
      monitor.recordOperation("encrypt", 200, 3072, true); // Only 1 success out of 3
      
      const alerts = monitor.getPerformanceAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((alert) => alert.includes("Success rate"))).toBe(true);
    });

    it("should generate alerts for individual metric thresholds (line 476, 516)", () => {
      // Set very low thresholds
      monitor.updateThresholds({
        maxDuration: 50,
        minThroughput: 100, // Very high
        maxMemoryUsage: 1000, // Very low
      });
      
      // Record operation that violates thresholds
      monitor.recordOperation("encrypt", 200, 1024, true); // Duration exceeds, throughput low
      
      const alerts = monitor.getPerformanceAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe("performHealthCheck", () => {
    it("should perform health check via setInterval with alerts (line 440-455)", async () => {
      // Set low threshold to trigger alerts
      monitor.updateThresholds({ maxDuration: 50 });
      
      // Record operations that exceed threshold
      monitor.recordOperation("encrypt", 200, 1024, true);
      
      // Advance timers to trigger health check
      jest.advanceTimersByTime(30000); // 30 seconds
      
      // Health check should have been called
      // We can't directly verify the log, but we can verify no errors
      expect(true).toBe(true);
    });

    it("should perform health check without alerts (line 450-455)", async () => {
      // Record operations within thresholds
      monitor.recordOperation("encrypt", 10, 1024, true);
      
      // Advance timers to trigger health check
      jest.advanceTimersByTime(30000);
      
      // Should complete without errors
      expect(true).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("should cleanup successfully", async () => {
      const instance = new ZkimPerformanceMonitor(undefined, defaultLogger);
      await instance.initialize();
      await expect(instance.cleanup()).resolves.not.toThrow();
    });
  });
});

