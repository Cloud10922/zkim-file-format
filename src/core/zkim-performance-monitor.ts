/**
 * ZKIM Performance Monitor
 *
 * Comprehensive performance monitoring and metrics collection for ZKIM operations
 * including encryption, decryption, serialization, and parsing performance.
 *
 * @fileoverview Performance monitoring and metrics collection
 */

import { ErrorUtils } from "../utils/error-handling";
import { ServiceBase } from "../utils/singleton-base";
import { ServiceError } from "../types/errors";

import { defaultLogger, type ILogger } from "../utils/logger";

/**
 * Performance monitoring constants
 */
const PERFORMANCE_CONSTANTS = {
  MAX_METRICS_RETENTION: 1000,
  PERCENTILE_95: 0.95,
  PERCENTILE_99: 0.99,
  HEALTH_CHECK_INTERVAL_MS: 30000,
  MILLISECONDS_PER_SECOND: 1000,
  BYTES_PER_MEGABYTE: 1024 * 1024,
} as const;

/**
 * Performance metrics interface
 */
export interface ZkimPerformanceMetrics {
  operation: string;
  duration: number;
  dataSize: number;
  throughput: number;
  memoryUsage: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Performance statistics
 */
export interface ZkimPerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  averageThroughput: number;
  averageMemoryUsage: number;
  successRate: number;
  p95Duration: number;
  p99Duration: number;
  maxDuration: number;
  minDuration: number;
}

/**
 * Performance thresholds
 */
export interface ZkimPerformanceThresholds {
  maxDuration: number;
  minThroughput: number;
  maxMemoryUsage: number;
  minSuccessRate: number;
}

/**
 * ZKIM Performance Monitor
 */
export class ZkimPerformanceMonitor extends ServiceBase {
  private readonly context = "ZkimPerformanceMonitor";
  private metrics: ZkimPerformanceMetrics[] = [];
  private thresholds: ZkimPerformanceThresholds;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private logger: ILogger;

  public constructor(
    thresholds?: Partial<ZkimPerformanceThresholds>,
    logger: ILogger = defaultLogger
  ) {
    super();
    this.thresholds = {
      maxDuration: 1000, // 1 second
      minThroughput: 10, // 10 MB/s
      maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      minSuccessRate: 0.95, // 95%
      ...thresholds,
    };
    this.logger = logger;
  }

  /**
   * Initialize performance monitoring
   */
  public async initialize(): Promise<void> {
    const context = ErrorUtils.createContext(this.context, "initialize", {
      severity: "high",
      timestamp: new Date().toISOString(),
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      await Promise.resolve(); // Ensure async operation
      this.logger.info("Initializing ZKIM Performance Monitor", {
        thresholds: this.thresholds,
      });

      this.startMonitoring();

      this.logger.info("ZKIM Performance Monitor initialized successfully");
    }, context);

    if (!result.success) {
      this.logger.error("ZKIM Performance Monitor initialization failed", {
        error: result.error,
        operation: context.operation,
      });
      throw new ServiceError(
        `Failed to initialize ZKIM Performance Monitor: ${result.error}`,
        {
          code: "ZKIM_PERFORMANCE_MONITOR_INIT_ERROR",
          details: {
            serviceName: this.context,
            error: result.error,
          },
        }
      );
    }
  }

  /**
   * Get memory usage from browser performance API
   * Falls back to 0 if performance.memory is not available
   */
  private getMemoryUsage(): number {
    if (
      typeof performance !== "undefined" &&
      "memory" in performance &&
      performance.memory !== undefined
    ) {
      const memory = performance.memory as {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
      return memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Record performance metrics for an operation
   */
  public recordOperation(
    operation: string,
    duration: number,
    dataSize: number,
    success: boolean,
    error?: string
  ): void {
    const context = ErrorUtils.createContext(this.context, "recordOperation", {
      severity: "medium",
      timestamp: new Date().toISOString(),
      operation,
      duration,
      dataSize,
    });

    try {
      const throughput =
        duration > 0
          ? (dataSize / PERFORMANCE_CONSTANTS.BYTES_PER_MEGABYTE) /
            (duration / PERFORMANCE_CONSTANTS.MILLISECONDS_PER_SECOND)
          : 0;
      const memoryUsage = this.getMemoryUsage();

      const metric: ZkimPerformanceMetrics = {
        operation,
        duration,
        dataSize,
        throughput,
        memoryUsage,
        timestamp: Date.now(),
        success,
        error,
      };

      this.metrics.push(metric);

      // Keep only last N metrics to prevent memory issues
      if (this.metrics.length > PERFORMANCE_CONSTANTS.MAX_METRICS_RETENTION) {
        this.metrics = this.metrics.slice(
          -PERFORMANCE_CONSTANTS.MAX_METRICS_RETENTION
        );
      }

      // Check thresholds
      this.checkThresholds(metric);

      this.logger.debug("Performance metric recorded", {
        operation,
        duration,
        throughput,
        success,
      });
    } catch (error) {
      this.logger.error("Failed to record performance metric", {
        error: error instanceof Error ? error.message : String(error),
        operation: context.operation,
      });
    }
  }

  /**
   * Get performance statistics
   */
  public getPerformanceStats(): ZkimPerformanceStats {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        averageThroughput: 0,
        averageMemoryUsage: 0,
        successRate: 0,
        p95Duration: 0,
        p99Duration: 0,
        maxDuration: 0,
        minDuration: 0,
      };
    }

    const successfulMetrics = this.metrics.filter((m) => m.success);
    const failedMetrics = this.metrics.filter((m) => !m.success);

    const durations = this.metrics.map((m) => m.duration).sort((a, b) => a - b);
    const throughputs = this.metrics.map((m) => m.throughput);
    const memoryUsages = this.metrics.map((m) => m.memoryUsage);

    const totalOperations = this.metrics.length;
    const successfulOperations = successfulMetrics.length;
    const failedOperations = failedMetrics.length;

    const averageDuration =
      durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const averageThroughput =
      throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
    const averageMemoryUsage =
      memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length;

    const successRate = successfulOperations / totalOperations;

    const p95Index = Math.floor(
      durations.length * PERFORMANCE_CONSTANTS.PERCENTILE_95
    );
    const p99Index = Math.floor(
      durations.length * PERFORMANCE_CONSTANTS.PERCENTILE_99
    );

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageDuration,
      averageThroughput,
      averageMemoryUsage,
      successRate,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
    };
  }

  /**
   * Get performance metrics for a specific operation
   */
  public getOperationMetrics(operation: string): ZkimPerformanceMetrics[] {
    return this.metrics.filter((m) => m.operation === operation);
  }

  /**
   * Get recent performance metrics
   */
  public getRecentMetrics(limit = 100): ZkimPerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Clear performance metrics
   */
  public clearMetrics(): void {
    this.metrics = [];
    this.logger.info("Performance metrics cleared");
  }

  /**
   * Update performance thresholds
   */
  public updateThresholds(
    thresholds: Partial<ZkimPerformanceThresholds>
  ): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.logger.info("Performance thresholds updated", {
      thresholds: this.thresholds,
    });
  }

  /**
   * Check if a metric value violates thresholds
   */
  private checkMetricThreshold(
    value: number,
    threshold: number,
    comparison: "greater" | "less"
  ): boolean {
    if (comparison === "greater") {
      return value > threshold;
    }
    return value < threshold;
  }

  /**
   * Generate alert message for threshold violation
   */
  private generateAlertMessage(
    metricName: string,
    value: number,
    threshold: number,
    unit: string,
    comparison: "exceeds" | "below"
  ): string {
    const formattedValue = typeof value === "number" && value % 1 !== 0
      ? value.toFixed(1)
      : String(value);
    const formattedThreshold = typeof threshold === "number" && threshold % 1 !== 0
      ? threshold.toFixed(1)
      : String(threshold);
    return `${metricName} (${formattedValue}${unit}) ${comparison} threshold (${formattedThreshold}${unit})`;
  }

  /**
   * Get performance alerts based on statistics
   */
  public getPerformanceAlerts(): string[] {
    const alerts: string[] = [];
    const stats = this.getPerformanceStats();

    if (
      this.checkMetricThreshold(
        stats.averageDuration,
        this.thresholds.maxDuration,
        "greater"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          "Average duration",
          stats.averageDuration,
          this.thresholds.maxDuration,
          "ms",
          "exceeds"
        )
      );
    }

    if (
      this.checkMetricThreshold(
        stats.averageThroughput,
        this.thresholds.minThroughput,
        "less"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          "Average throughput",
          stats.averageThroughput,
          this.thresholds.minThroughput,
          "MB/s",
          "below"
        )
      );
    }

    const averageMemoryMB =
      stats.averageMemoryUsage / PERFORMANCE_CONSTANTS.BYTES_PER_MEGABYTE;
    const maxMemoryMB =
      this.thresholds.maxMemoryUsage / PERFORMANCE_CONSTANTS.BYTES_PER_MEGABYTE;

    if (
      this.checkMetricThreshold(
        stats.averageMemoryUsage,
        this.thresholds.maxMemoryUsage,
        "greater"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          "Average memory usage",
          averageMemoryMB,
          maxMemoryMB,
          "MB",
          "exceeds"
        )
      );
    }

    if (
      this.checkMetricThreshold(
        stats.successRate,
        this.thresholds.minSuccessRate,
        "less"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          "Success rate",
          stats.successRate * 100,
          this.thresholds.minSuccessRate * 100,
          "%",
          "below"
        )
      );
    }

    return alerts;
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, PERFORMANCE_CONSTANTS.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    const alerts = this.getPerformanceAlerts();

    if (alerts.length > 0) {
      this.logger.warn("Performance alerts detected", { alerts });
    }

    const stats = this.getPerformanceStats();
    this.logger.debug("Performance health check", {
      totalOperations: stats.totalOperations,
      successRate: stats.successRate,
      averageDuration: stats.averageDuration,
      averageThroughput: stats.averageThroughput,
    });
  }

  /**
   * Check performance thresholds for a single metric
   */
  private checkThresholds(metric: ZkimPerformanceMetrics): void {
    const alerts: string[] = [];

    if (
      this.checkMetricThreshold(
        metric.duration,
        this.thresholds.maxDuration,
        "greater"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          `Operation ${metric.operation} duration`,
          metric.duration,
          this.thresholds.maxDuration,
          "ms",
          "exceeds"
        )
      );
    }

    if (
      this.checkMetricThreshold(
        metric.throughput,
        this.thresholds.minThroughput,
        "less"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          `Operation ${metric.operation} throughput`,
          metric.throughput,
          this.thresholds.minThroughput,
          "MB/s",
          "below"
        )
      );
    }

    const memoryMB = metric.memoryUsage / PERFORMANCE_CONSTANTS.BYTES_PER_MEGABYTE;
    const maxMemoryMB =
      this.thresholds.maxMemoryUsage / PERFORMANCE_CONSTANTS.BYTES_PER_MEGABYTE;

    if (
      this.checkMetricThreshold(
        metric.memoryUsage,
        this.thresholds.maxMemoryUsage,
        "greater"
      )
    ) {
      alerts.push(
        this.generateAlertMessage(
          `Operation ${metric.operation} memory usage`,
          memoryMB,
          maxMemoryMB,
          "MB",
          "exceeds"
        )
      );
    }

    if (alerts.length > 0) {
      this.logger.warn("Performance threshold exceeded", {
        operation: metric.operation,
        alerts,
        metric,
      });
    }
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.logger.info("Performance monitoring stopped");
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext(this.context, "cleanup", {
      severity: "medium",
      timestamp: new Date().toISOString(),
    });

    await ErrorUtils.withErrorHandling(async () => {
      await Promise.resolve(); // Ensure async operation
      this.stopMonitoring();
      this.clearMetrics();
      this.logger.info("ZKIM Performance Monitor cleaned up");
    }, context);
  }
}

/**
 * Export singleton instance using ServiceBase pattern
 * Note: Use ZkimPerformanceMonitor.getServiceInstance() when importing this module
 */
export { ZkimPerformanceMonitor as zkimPerformanceMonitor };

