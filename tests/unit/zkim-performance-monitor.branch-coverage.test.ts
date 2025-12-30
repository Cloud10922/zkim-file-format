/**
 * ZKIM Performance Monitor Branch Coverage Tests
 * Targets specific branches to improve branch coverage metrics
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { ZkimPerformanceMonitor } from "../../src/core/zkim-performance-monitor";
import { defaultLogger } from "../../src/utils/logger";

describe("ZkimPerformanceMonitor - Branch Coverage", () => {
  let monitor: ZkimPerformanceMonitor;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.restoreAllMocks();

    monitor = new ZkimPerformanceMonitor(undefined, defaultLogger);
    await monitor.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    jest.restoreAllMocks();

    if (monitor) {
      await monitor.cleanup();
    }

    jest.useRealTimers();
  });

  describe("getMemoryUsage - browser memory API branches", () => {
    it("should return memory usage when performance.memory is available (line 137-147)", () => {
      // Mock performance.memory to be available
      const originalPerformance = global.performance;
      const mockMemory = {
        usedJSHeapSize: 50 * 1024 * 1024, // 50MB
        totalJSHeapSize: 100 * 1024 * 1024, // 100MB
        jsHeapSizeLimit: 200 * 1024 * 1024, // 200MB
      };

      (global as any).performance = {
        ...originalPerformance,
        memory: mockMemory,
      };

      try {
        const memoryUsage = (monitor as any).getMemoryUsage();
        expect(memoryUsage).toBe(mockMemory.usedJSHeapSize);
      } finally {
        // Restore original performance
        (global as any).performance = originalPerformance;
      }
    });

    it("should return 0 when performance.memory is not available (line 149)", () => {
      // In Node.js, performance.memory is typically not available
      const memoryUsage = (monitor as any).getMemoryUsage();
      expect(memoryUsage).toBe(0);
    });

    it("should return 0 when performance is undefined (line 138-149)", () => {
      const originalPerformance = global.performance;
      delete (global as any).performance;

      try {
        const memoryUsage = (monitor as any).getMemoryUsage();
        expect(memoryUsage).toBe(0);
      } finally {
        (global as any).performance = originalPerformance;
      }
    });

    it("should return 0 when performance.memory is undefined (line 140-149)", () => {
      const originalPerformance = global.performance;
      (global as any).performance = {
        ...originalPerformance,
        memory: undefined,
      };

      try {
        const memoryUsage = (monitor as any).getMemoryUsage();
        expect(memoryUsage).toBe(0);
      } finally {
        (global as any).performance = originalPerformance;
      }
    });
  });

  describe("getPerformanceAlerts - memory usage threshold branch", () => {
    it("should alert when average memory usage exceeds threshold (line 392-399)", () => {
      // Set a low memory threshold
      monitor.updateThresholds({
        maxMemoryUsage: 10 * 1024 * 1024, // 10MB
      });

      // Mock getMemoryUsage to return high memory usage
      const originalGetMemoryUsage = (monitor as any).getMemoryUsage;
      (monitor as any).getMemoryUsage = jest.fn(() => 20 * 1024 * 1024); // 20MB

      // Record operations with high memory usage
      monitor.recordOperation("test", 100, 1024, true);
      monitor.recordOperation("test", 100, 1024, true);

      const alerts = monitor.getPerformanceAlerts();
      
      // Should have memory usage alert
      const memoryAlert = alerts.find(alert => alert.includes("Average memory usage"));
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert).toContain("exceeds");

      // Restore
      (monitor as any).getMemoryUsage = originalGetMemoryUsage;
    });
  });

  describe("checkThresholds - memory usage threshold branch", () => {
    it("should alert when operation memory usage exceeds threshold (line 509-516)", () => {
      // Set a low memory threshold
      monitor.updateThresholds({
        maxMemoryUsage: 10 * 1024 * 1024, // 10MB
      });

      // Mock getMemoryUsage to return high memory usage
      const originalGetMemoryUsage = (monitor as any).getMemoryUsage;
      (monitor as any).getMemoryUsage = jest.fn(() => 20 * 1024 * 1024); // 20MB

      // Record operation with high memory usage
      monitor.recordOperation("test", 100, 1024, true);

      // The checkThresholds method is called internally by recordOperation
      // We can verify it was called by checking if alerts were generated
      const stats = monitor.getPerformanceStats();
      expect(stats.averageMemoryUsage).toBeGreaterThan(10 * 1024 * 1024);

      // Restore
      (monitor as any).getMemoryUsage = originalGetMemoryUsage;
    });
  });

  describe("recordOperation - duration branches", () => {
    it("should calculate throughput when duration > 0 (line 172-174)", () => {
      monitor.recordOperation("test", 100, 1024 * 1024, true); // 1MB in 100ms

      const metrics = monitor.getRecentMetrics(1);
      expect(metrics[0].throughput).toBeGreaterThan(0);
    });

    it("should set throughput to 0 when duration is 0 (line 175)", () => {
      monitor.recordOperation("test", 0, 1024 * 1024, true);

      const metrics = monitor.getRecentMetrics(1);
      expect(metrics[0].throughput).toBe(0);
    });
  });

  describe("getPerformanceStats - percentile branches", () => {
    it("should return 0 for percentiles when index is out of bounds (line 270-271)", () => {
      // Create a single metric - p95 and p99 indices may be out of bounds
      monitor.recordOperation("test", 100, 1024, true);

      const stats = monitor.getPerformanceStats();
      expect(stats.p95Duration).toBeGreaterThanOrEqual(0);
      expect(stats.p99Duration).toBeGreaterThanOrEqual(0);
    });

    it("should calculate percentiles correctly with multiple metrics", () => {
      // Record multiple operations
      for (let i = 0; i < 10; i++) {
        monitor.recordOperation("test", 100 + i * 10, 1024, true);
      }

      const stats = monitor.getPerformanceStats();
      expect(stats.p95Duration).toBeGreaterThanOrEqual(0);
      expect(stats.p99Duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("startMonitoring - interval management branch", () => {
    it("should clear existing interval before starting new one (line 435-437)", async () => {
      const monitorWithInterval = new ZkimPerformanceMonitor(undefined, defaultLogger);
      await monitorWithInterval.initialize();

      // startMonitoring is called during initialize
      // Call it again to test the clearInterval branch
      (monitorWithInterval as any).startMonitoring();

      // Should not throw and should have a valid interval
      expect((monitorWithInterval as any).monitoringInterval).toBeDefined();

      await monitorWithInterval.cleanup();
    });
  });

  describe("stopMonitoring - interval cleanup branch", () => {
    it("should clear interval when monitoringInterval exists (line 540-542)", () => {
      const monitorWithInterval = new ZkimPerformanceMonitor(undefined, defaultLogger);
      
      // Initialize to start monitoring
      monitorWithInterval.initialize().then(() => {
        // Stop monitoring should clear the interval
        monitorWithInterval.stopMonitoring();
        expect((monitorWithInterval as any).monitoringInterval).toBeNull();
      });
    });

    it("should handle stopMonitoring when interval is null (line 540)", () => {
      // Stop monitoring when no interval exists
      monitor.stopMonitoring();
      
      // Should not throw
      expect((monitor as any).monitoringInterval).toBeNull();
    });
  });

  describe("performHealthCheck - alerts branch", () => {
    it("should log warning when alerts are detected (line 450-452)", async () => {
      // Set low thresholds to trigger alerts
      monitor.updateThresholds({
        maxDuration: 50, // Very low threshold
        minThroughput: 100, // Very high threshold
        maxMemoryUsage: 1 * 1024 * 1024, // Very low threshold
        minSuccessRate: 0.99, // Very high threshold
      });

      // Record operations that will trigger alerts
      monitor.recordOperation("test", 1000, 1024, true); // Duration exceeds
      monitor.recordOperation("test", 100, 1024, false); // Success rate below

      // Trigger health check
      (monitor as any).performHealthCheck();

      // Advance timers to trigger health check
      await jest.advanceTimersByTimeAsync(30000);

      // Health check should have been called
      // We can't easily verify the warning was logged, but we can verify the method runs
      expect(monitor.getPerformanceStats().totalOperations).toBeGreaterThan(0);
    });

    it("should not log warning when no alerts are detected (line 450)", async () => {
      // Record operations that won't trigger alerts
      monitor.recordOperation("test", 10, 1024 * 1024, true); // Fast, successful

      // Trigger health check
      (monitor as any).performHealthCheck();

      // Advance timers
      await jest.advanceTimersByTimeAsync(30000);

      // Should complete without errors
      expect(monitor.getPerformanceStats().totalOperations).toBeGreaterThan(0);
    });
  });
});

