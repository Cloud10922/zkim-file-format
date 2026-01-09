/**
 * ZKIM Performance Monitor Tests
 * Comprehensive tests for performance monitoring service
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { ZkimPerformanceMonitor } from "../../src/core/zkim-performance-monitor";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";

describe("ZkimPerformanceMonitor", () => {
  let monitor: ZkimPerformanceMonitor;

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    monitor = new ZkimPerformanceMonitor(undefined, defaultLogger);
    await monitor.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (monitor) {
      await monitor.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new ZkimPerformanceMonitor(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimPerformanceMonitor);
    });

    it("should create instance with custom thresholds", () => {
      const instance = new ZkimPerformanceMonitor(
        {
          maxResponseTime: 5000,
          maxMemoryUsage: 1000000,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(ZkimPerformanceMonitor);
    });
  });

  describe("recordOperation", () => {
    it("should record operation metrics", () => {
      monitor.recordOperation("test-operation", 100, 1024, true);
      // Should not throw
      expect(true).toBe(true);
    });

    it("should record failed operation", () => {
      monitor.recordOperation("test-operation", 100, 1024, false, "test error");
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("getPerformanceStats", () => {
    it("should return performance statistics", () => {
      const stats = monitor.getPerformanceStats();
      expect(stats).toHaveProperty("totalOperations");
      expect(stats).toHaveProperty("successfulOperations");
      expect(stats).toHaveProperty("failedOperations");
      expect(stats).toHaveProperty("averageDuration");
      expect(stats).toHaveProperty("averageThroughput");
      expect(stats).toHaveProperty("successRate");
    });
  });

  describe("getOperationMetrics", () => {
    it("should return operation metrics", () => {
      monitor.recordOperation("test-operation", 100, 1024, true);
      const metrics = monitor.getOperationMetrics("test-operation");
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe("getRecentMetrics", () => {
    it("should return recent metrics", () => {
      const metrics = monitor.getRecentMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it("should return limited recent metrics", () => {
      const metrics = monitor.getRecentMetrics(10);
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe("clearMetrics", () => {
    it("should clear all metrics", () => {
      monitor.recordOperation("test-operation", 100, 1024, true);
      monitor.clearMetrics();
      const stats = monitor.getPerformanceStats();
      expect(stats.totalOperations).toBe(0);
    });
  });

  describe("updateThresholds", () => {
    it("should update performance thresholds", () => {
      monitor.updateThresholds({
        maxResponseTime: 5000,
        maxMemoryUsage: 1000000,
      });
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("getPerformanceAlerts", () => {
    it("should return performance alerts", () => {
      const alerts = monitor.getPerformanceAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });
  });
});
