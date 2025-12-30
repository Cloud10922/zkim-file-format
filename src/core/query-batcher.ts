/**
 * ZKIM Query Batcher Service - Query Optimization and Batching
 * Handles query batching, load balancing, and optimization for searchable encryption
 * 
 * Service Flow:
 * 1. Batch multiple queries for efficient processing
 * 2. Implement load balancing across search nodes
 * 3. Optimize query execution and caching
 * 4. Provide query analytics and performance metrics
 */

import { ErrorUtils } from "../utils/error-handling";
import { ServiceBase } from "../utils/singleton-base";

import { defaultLogger, type ILogger } from "../utils/logger";

import type {
  CachedResult,
  MetadataWithAccessLevel,
  QueryBatch,
  QueryBatchConfig,
  QueryBatcherPerformanceMetrics,
  SearchQuery,
  SearchResult,
} from "../types/zkim-file-format";

// QueryBatcherServiceConfig extends QueryBatchConfig with additional fields
export interface QueryBatcherServiceConfig extends QueryBatchConfig {
  maxResultsPerQuery: number;
  enableQueryCaching: boolean;
  cacheSize: number;
  cacheTTL: number;
  enablePerformanceMetrics: boolean;
}


export class QueryBatcher extends ServiceBase {
  private readonly defaultConfig: QueryBatcherServiceConfig = {
    enableBatching: true,
    batchSize: 10,
    batchTimeout: 5000, // 5 seconds
    maxConcurrentBatches: 5,
    maxResultsPerQuery: 100,
    enableLoadBalancing: true,
    enableQueryOptimization: true,
    enableQueryCaching: true,
    cacheSize: 1000,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
    enablePerformanceMetrics: true,
  };

  private config: QueryBatcherServiceConfig;
  private isInitialized = false;
  private pendingQueries: SearchQuery[] = [];
  private activeBatches: Map<string, QueryBatch> = new Map();
  private queryCache: Map<string, CachedResult> = new Map();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchCleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private logger: ILogger;
  private performanceMetrics: QueryBatcherPerformanceMetrics;

  private createPerformanceMetrics(): QueryBatcherPerformanceMetrics {
    const metrics = {
      totalBatches: 0,
      totalQueries: 0,
      totalProcessingTime: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageProcessingTime: 0,
      successRate: 0,
      averageBatchTime: 0,
      averageQueryTime: 0,
      cacheHitRate: 0,
      loadBalancingEfficiency: 0,
      updateBatchMetrics: (batchTime: number) => {
        metrics.totalBatches++;
        metrics.averageBatchTime =
          (metrics.averageBatchTime * (metrics.totalBatches - 1) + batchTime) /
          metrics.totalBatches;
      },
      updateQueryMetrics: (queryTime: number, success: boolean) => {
        metrics.totalQueries++;
        metrics.averageQueryTime =
          (metrics.averageQueryTime * (metrics.totalQueries - 1) + queryTime) /
          metrics.totalQueries;

        if (success) {
          metrics.successfulQueries++;
          metrics.cacheHitRate =
            (metrics.cacheHitRate * (metrics.totalQueries - 1) + 1) /
            metrics.totalQueries;
        } else {
          metrics.failedQueries++;
        }
      },
      reset: () => {
        metrics.totalBatches = 0;
        metrics.totalQueries = 0;
        metrics.totalProcessingTime = 0;
        metrics.successfulQueries = 0;
        metrics.failedQueries = 0;
        metrics.averageProcessingTime = 0;
        metrics.successRate = 0;
        metrics.averageBatchTime = 0;
        metrics.averageQueryTime = 0;
        metrics.cacheHitRate = 0;
        metrics.loadBalancingEfficiency = 0;
      },
    };
    return metrics;
  }
  private batchCounter = 0;

  public constructor(
    config?: Partial<QueryBatcherServiceConfig>,
    logger: ILogger = defaultLogger
  ) {
    super();
    this.config = { ...this.defaultConfig, ...config };
    this.logger = logger;
    this.performanceMetrics = this.createPerformanceMetrics();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const context = ErrorUtils.createContext("QueryBatcher", "initialize", {
      severity: "high",
    });

    await ErrorUtils.withErrorHandling(async () => {
      this.logger.info("Initializing ZKIM Query Batcher Service", {
        config: this.config,
      });

      // Initialize batching system
      this.initializeBatchingSystem();

      // Start batch processing timer only if batching is enabled
      if (this.config.enableBatching) {
        this.startBatchProcessing();
      }

      this.initialized = true;
      this.logger.info("ZKIM Query Batcher Service initialized successfully");
    }, context);
  }

  /**
   * Add query to batch processing
   */
  public async addQuery(query: SearchQuery): Promise<string> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("QueryBatcher", "addQuery", {
      severity: "medium",
      userId: query.userId,
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      // Check cache first
      if (this.config.enableQueryCaching) {
        const cachedResult = this.getCachedResult(query);
        if (cachedResult) {
          this.logger.info("Query served from cache", {
            queryId: query.queryId,
            userId: query.userId,
            query: query.query,
          });
          return `cached_${query.queryId}`;
        }
      }

      // Add to pending queries
      this.pendingQueries.push(query);

      // Check if we should start a new batch
      if (this.shouldStartNewBatch()) {
        await this.processBatch();
      }

      this.logger.info("Query added to batch processing", {
        queryId: query.queryId,
        userId: query.userId,
        query: query.query,
        pendingQueries: this.pendingQueries.length,
        activeBatches: this.activeBatches.size,
      });

      return query.queryId;
    }, context);

    return result.success ? result.data || query.queryId : query.queryId;
  }

  /**
   * Process queries in batches
   */
  public async processBatch(): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("QueryBatcher", "processBatch", {
      severity: "medium",
    });

    await ErrorUtils.withErrorHandling(async () => {
      if (this.pendingQueries.length === 0) {
        return;
      }

      // Check concurrent batch limit
      if (this.activeBatches.size >= this.config.maxConcurrentBatches) {
        this.logger.info(
          "Maximum concurrent batches reached, waiting for completion",
          {
            activeBatches: this.activeBatches.size,
            maxConcurrentBatches: this.config.maxConcurrentBatches,
          }
        );
        return;
      }

      // Create new batch
      const batchId = this.generateBatchId();
      const batchSize = Math.min(
        this.config.batchSize,
        this.pendingQueries.length
      );
      const batchQueries = this.pendingQueries.splice(0, batchSize);

      const batch: QueryBatch = {
        batchId,
        queries: batchQueries,
        createdAt: Date.now(),
        status: "pending",
        results: [],
        processingTime: 0,
        errorCount: 0,
      };

      // Add to active batches
      this.activeBatches.set(batchId, batch);

      // Process batch asynchronously
      this.processBatchAsync(batch);

      this.logger.info("New batch created", {
        batchId,
        batchSize: batchQueries.length,
        totalPending: this.pendingQueries.length,
        totalActive: this.activeBatches.size,
      });
    }, context);
  }

  /**
   * Get batch status and results
   */
  public async getBatchStatus(batchId: string): Promise<QueryBatch | null> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("QueryBatcher", "getBatchStatus", {
      severity: "low",
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      const batch = this.activeBatches.get(batchId);

      if (!batch) {
        // Check if batch is completed and removed
        this.logger.warn("Batch not found", { batchId });
        return null;
      }

      return batch;
    }, context);

    return result.success ? result.data || null : null;
  }

  /**
   * Get query results from batch
   */
  public async getQueryResults(queryId: string): Promise<SearchResult | null> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "QueryBatcher",
      "getQueryResults",
      {
        severity: "medium",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      // Check cache first
      if (this.config.enableQueryCaching) {
        const cachedResult = this.queryCache.get(queryId);
        if (cachedResult && this.isCacheValid(cachedResult)) {
          cachedResult.accessCount++;
          return cachedResult.result;
        }
      }

      // Find batch containing this query
      for (const batch of this.activeBatches.values()) {
        if (batch.status === "completed") {
          const result = batch.results.find((r) => r.queryId === queryId);
          if (result) {
            // Cache result
            if (this.config.enableQueryCaching) {
              this.cacheResult(queryId, result);
            }
            return result;
          }
        }
      }

      this.logger.warn("Query results not found", { queryId });
      return null;
    }, context);

    return result.success ? result.data || null : null;
  }

  /**
   * Get performance metrics
   */
  public async getPerformanceMetrics(): Promise<{
    totalBatches: number;
    totalQueries: number;
    averageBatchTime: number;
    averageQueryTime: number;
    cacheHitRate: number;
    loadBalancingEfficiency: number;
    pendingQueries: number;
    activeBatches: number;
    cacheSize: number;
  }> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "QueryBatcher",
      "getPerformanceMetrics",
      {
        severity: "low",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      return {
        totalBatches: this.performanceMetrics.totalBatches,
        totalQueries: this.performanceMetrics.totalQueries,
        averageBatchTime: this.performanceMetrics.averageBatchTime,
        averageQueryTime: this.performanceMetrics.averageQueryTime,
        cacheHitRate: this.performanceMetrics.cacheHitRate,
        loadBalancingEfficiency:
          this.performanceMetrics.loadBalancingEfficiency,
        pendingQueries: this.pendingQueries.length,
        activeBatches: this.activeBatches.size,
        cacheSize: this.queryCache.size,
      };
    }, context);

    return result.success
      ? result.data || {
          totalBatches: 0,
          totalQueries: 0,
          averageBatchTime: 0,
          averageQueryTime: 0,
          cacheHitRate: 0,
          loadBalancingEfficiency: 0,
          pendingQueries: 0,
          activeBatches: 0,
          cacheSize: 0,
        }
      : {
          totalBatches: 0,
          totalQueries: 0,
          averageBatchTime: 0,
          averageQueryTime: 0,
          cacheHitRate: 0,
          loadBalancingEfficiency: 0,
          pendingQueries: 0,
          activeBatches: 0,
          cacheSize: 0,
        };
  }

  /**
   * Clear cache and reset metrics
   */
  public async reset(): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("QueryBatcher", "reset", {
      severity: "medium",
    });

    await ErrorUtils.withErrorHandling(async () => {
      this.queryCache.clear();
      this.performanceMetrics.reset();
      this.pendingQueries = [];

      // Cancel active batches
      for (const batch of this.activeBatches.values()) {
        batch.status = "failed";
        batch.errorCount++;
      }

      this.activeBatches.clear();

      this.logger.info("Query Batcher Service reset completed");
    }, context);
  }

  // ===== PRIVATE HELPER METHODS =====

  protected async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private initializeBatchingSystem(): void {
    // Initialize batching system
    // This will be enhanced in Phase 2 with advanced batching algorithms
    this.logger.info("Batching system initialized");
  }

  private startBatchProcessing(): void {
    // Start batch processing timer
    this.batchTimer = setInterval(() => {
      this.processBatch();
    }, this.config.batchTimeout);

    this.logger.info("Batch processing timer started", {
      batchTimeout: this.config.batchTimeout,
    });
  }

  private shouldStartNewBatch(): boolean {
    return (
      this.pendingQueries.length >= this.config.batchSize &&
      this.activeBatches.size < this.config.maxConcurrentBatches
    );
  }

  private generateBatchId(): string {
    this.batchCounter++;
    return `batch_${Date.now()}_${this.batchCounter}`;
  }

  private async processBatchAsync(batch: QueryBatch): Promise<void> {
    try {
      // Update batch status
      batch.status = "processing";
      const startTime = performance.now();

      // Process queries in batch
      const results: SearchResult[] = [];
      let errorCount = 0;

      for (const query of batch.queries) {
        try {
          // Simulate query processing (will be replaced with actual search in Phase 2)
          const result = await this.processQuery(query);
          results.push(result);
        } catch (error) {
          errorCount++;
          this.logger.error("Query processing failed", {
            queryId: query.queryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Update batch with results
      batch.results = results;
      batch.errorCount = errorCount;
      batch.status = "completed";
      batch.processingTime = performance.now() - startTime;

      // Update performance metrics
      this.performanceMetrics.updateBatchMetrics(batch.processingTime);
      this.performanceMetrics.updateQueryMetrics(
        batch.processingTime / batch.queries.length,
        true
      );

      // Remove completed batch after some time
      const cleanupTimer = setTimeout(() => {
        this.activeBatches.delete(batch.batchId);
        this.batchCleanupTimers.delete(batch.batchId);
      }, 60000); // Keep for 1 minute
      this.batchCleanupTimers.set(batch.batchId, cleanupTimer);

      this.logger.info("Batch processing completed", {
        batchId: batch.batchId,
        queryCount: batch.queries.length,
        resultCount: results.length,
        errorCount,
        processingTime: batch.processingTime,
      });
    } catch (error) {
      batch.status = "failed";
      batch.errorCount++;

      this.logger.error("Batch processing failed", {
        batchId: batch.batchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processQuery(query: SearchQuery): Promise<SearchResult> {
    const context = ErrorUtils.createContext("QueryBatcher", "processQuery", {
      severity: "medium",
      queryId: query.queryId,
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      const startTime = Date.now();

      try {
        // Import searchable encryption service
        const { SearchableEncryption } = await import(
          "./searchable-encryption"
        );

        // Process query using real search infrastructure
        const searchResult = await SearchableEncryption.search(
          query,
          this.config.maxResultsPerQuery
        );

        const processingTime = Date.now() - startTime;

        // Update performance metrics
        this.updateQueryMetrics(query, processingTime, true);

        this.logger.info("Query processed successfully", {
          service: "QueryBatcher",
          operation: "processQuery",
          metadata: {
            queryId: query.queryId,
            processingTime,
            resultCount: searchResult.totalResults,
            privacyLevel: searchResult.privacyLevel,
          },
        });

        return {
          queryId: query.queryId,
          results: searchResult.results || [],
          totalResults: searchResult.totalResults || 0,
          processingTime,
          privacyLevel: searchResult.privacyLevel || "medium",
          metadata: {
            batchProcessed: true,
            timestamp: Date.now(),
            searchServiceUsed: "searchableEncryption",
            performanceScore: this.calculatePerformanceScore(processingTime),
          },
        };
      } catch (error) {
        const processingTime = Date.now() - startTime;

        // Update performance metrics
        this.updateQueryMetrics(query, processingTime, false);

        this.logger.error("Query processing failed", {
          service: "QueryBatcher",
          operation: "processQuery",
          metadata: {
            queryId: query.queryId,
            processingTime,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        // Return error result instead of throwing
        return {
          queryId: query.queryId,
          results: [],
          totalResults: 0,
          processingTime,
          privacyLevel: "low" as const,
          metadata: {
            batchProcessed: false,
            timestamp: Date.now(),
            error:
              error instanceof Error
                ? error.message
                : "Query processing failed",
            searchServiceUsed: "none",
            performanceScore: 0,
          },
        };
      }
    }, context);

    return result.success
      ? result.data || {
          queryId: query.queryId,
          results: [],
          totalResults: 0,
          processingTime: 0,
          privacyLevel: "low" as const,
          metadata: {
            batchProcessed: false,
            timestamp: Date.now(),
            error: "Query processing failed",
            searchServiceUsed: "none",
            performanceScore: 0,
          },
        }
      : {
          queryId: query.queryId,
          results: [],
          totalResults: 0,
          processingTime: 0,
          privacyLevel: "low" as const,
          metadata: {
            batchProcessed: false,
            timestamp: Date.now(),
            error: "Query processing failed",
            searchServiceUsed: "none",
            performanceScore: 0,
          },
        };
  }

  private getCachedResult(query: SearchQuery): SearchResult | null {
    const cacheKey = this.generateCacheKey(query);
    const cached = this.queryCache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.result;
    }

    return null;
  }

  /**
   * Update query performance metrics
   */
  private updateQueryMetrics(
    _query: SearchQuery,
    processingTime: number,
    success: boolean
  ): void {
    if (!this.config.enablePerformanceMetrics) {
      return;
    }

    // Update batch metrics
    this.performanceMetrics.totalQueries++;
    this.performanceMetrics.totalProcessingTime += processingTime;

    if (success) {
      this.performanceMetrics.successfulQueries++;
    } else {
      this.performanceMetrics.failedQueries++;
    }

    // Update average processing time
    this.performanceMetrics.averageProcessingTime =
      this.performanceMetrics.totalProcessingTime /
      this.performanceMetrics.totalQueries;

    // Update success rate
    this.performanceMetrics.successRate =
      this.performanceMetrics.successfulQueries /
      this.performanceMetrics.totalQueries;
  }

  /**
   * Calculate performance score based on processing time
   */
  private calculatePerformanceScore(processingTime: number): number {
    // Performance score: 1.0 = excellent, 0.0 = poor
    // Based on processing time thresholds
    const excellentThreshold = 100; // 100ms
    const goodThreshold = 500; // 500ms
    const poorThreshold = 2000; // 2s

    if (processingTime <= excellentThreshold) {
      return 1.0;
    } else if (processingTime <= goodThreshold) {
      return 0.8;
    } else if (processingTime <= poorThreshold) {
      return 0.5;
    } else {
      return 0.2;
    }
  }

  private cacheResult(_queryId: string, result: SearchResult): void {
    if (this.queryCache.size >= this.config.cacheSize) {
      // Remove oldest entries
      const entries = Array.from(this.queryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(
        0,
        Math.floor(this.config.cacheSize * 0.2)
      ); // Remove 20%
      for (const [key] of toRemove) {
        this.queryCache.delete(key);
      }
    }

    const cacheKey = this.generateCacheKey({
      queryId: _queryId,
      query:
        result.results.length > 0
          ? result.results[0]?.metadata?.fileName || ""
          : "",
      userId:
        result.results.length > 0
          ? (result.results[0]?.metadata as MetadataWithAccessLevel)
              ?.accessLevel || "none"
          : "none",
      timestamp: Date.now(),
      priority: "medium",
    });

    this.queryCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  private generateCacheKey(_query: SearchQuery): string {
    // Generate cache key based on query parameters
    return `${_query.userId}_${_query.query}_${_query.priority}`;
  }

  private isCacheValid(cached: { timestamp: number }): boolean {
    const now = Date.now();
    return now - cached.timestamp < this.config.cacheTTL;
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext("QueryBatcher", "cleanup", {
      severity: "low",
    });

    await ErrorUtils.withErrorHandling(async () => {
      // Clear batch processing timer
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = null;
      }

      // Clear all batch cleanup timers
      for (const [batchId, timer] of this.batchCleanupTimers.entries()) {
        clearTimeout(timer);
        this.batchCleanupTimers.delete(batchId);
      }

      this.pendingQueries = [];
      this.activeBatches.clear();
      this.queryCache.clear();
      this.initialized = false;

      this.logger.info("ZKIM Query Batcher Service cleaned up");
    }, context);
  }
}

// Use QueryBatcher.getServiceInstance() instead of direct instantiation
