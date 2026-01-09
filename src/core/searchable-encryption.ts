/**
 * ZKIM Searchable Encryption Service - OPRF-based Privacy-Preserving Search
 * Implements searchable encryption using OPRF on ristretto255 curve
 *
 * Service Flow:
 * 1. Index files with OPRF-based searchable encryption
 * 2. Process search queries with privacy enhancement
 * 3. Return results with rate limiting and padding
 * 4. Manage trapdoor rotation and revocation
 */

import sodium from "libsodium-wrappers-sumo";

import { ristretto255 } from "@noble/curves/ed25519.js";
import { blake3 } from "@noble/hashes/blake3.js";

import { ErrorUtils } from "../utils/error-handling";
import { ServiceBase } from "../utils/singleton-base";

import { ServiceError } from "../types/errors";

import { defaultLogger, type ILogger } from "../utils/logger";

import type {
  IndexedFile,
  QueryHistoryEntry,
  SearchQuery,
  SearchResult,
  SearchableEncryptionConfig,
  Trapdoor,
  ZkimFile,
  ZkimFileMetadata,
  ZkimFileSearchResult,
} from "../types/zkim-file-format";

/**
 * Simple platform environment check
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

/**
 * File service interface to avoid circular dependency
 * Methods are optional - service will gracefully handle missing implementations
 */
export interface IFileService {
  getZkimFile(fileId: string): Promise<{ success: boolean; data?: ZkimFile | null }>;
  decryptZkimFile?(
    file: ZkimFile,
    userId: string,
    userKey: Uint8Array
  ): Promise<Uint8Array>;
  createZkimFile?(
    data: Uint8Array,
    fileName: string,
    platformKey: Uint8Array,
    userKey: Uint8Array,
    metadata?: Partial<ZkimFileMetadata>
  ): Promise<{ success: boolean; data?: ZkimFile }>;
}

export class SearchableEncryption extends ServiceBase {
  private readonly defaultConfig: SearchableEncryptionConfig = {
    enableOPRF: true,
    enableRateLimiting: true,
    enableQueryBatching: true,
    enableTrapdoorRotation: true,
    epochDuration: 24 * 60 * 60 * 1000, // 24 hours
    maxQueriesPerEpoch: 1000,
    bucketSizes: [32, 64, 128, 256, 512, 1024],
    minCoverage: 0.15, // 15% minimum coverage
    enablePrivacyEnhancement: true,
    enableResultPadding: true,
    enableQueryLogging: true,
  };

  public static async search(
    query: SearchQuery,
    limit?: number
  ): Promise<SearchResult> {
    const instance = await SearchableEncryption.getServiceInstance();
    return instance.search(query, limit);
  }

  private config: SearchableEncryptionConfig;
  private isInitialized = false;
  private fileIndex: Map<string, IndexedFile> = new Map();
  private trapdoors: Map<string, Trapdoor> = new Map();
  private queryHistory: Map<string, QueryHistoryEntry> = new Map();
  private currentEpoch = 0;
  private epochStartTime: number = Date.now();
  private oprfSecretKey: Uint8Array | null = null;
  private zkimFileService: IFileService | null = null;
  private saveIndexTimer: ReturnType<typeof setInterval> | null = null;
  private epochTimer: ReturnType<typeof setInterval> | null = null;
  private logger: ILogger;

  private createIndexedFile(
    fileId: string,
    objectId: string,
    userId: string,
    metadata: Partial<ZkimFileMetadata>,
    searchTokens: string[],
    lastAccessed: number,
    indexedAt: number
  ): IndexedFile {
    return {
      fileId,
      objectId,
      userId,
      metadata: {
        ...metadata,
        createdAt: metadata.createdAt ?? Date.now(),
      } as ZkimFileMetadata,
      trapdoors: searchTokens,
      indexedAt,
      lastAccessed,
      accessCount: 0,
      privacyLevel: "medium",
    };
  }

  private createQueryHistoryEntry(
    queryId: string,
    userId: string,
    query: string,
    timestamp: number,
    resultCount: number,
    processingTime: number
  ): QueryHistoryEntry {
    return {
      queryId,
      userId,
      query,
      timestamp,
      resultsCount: resultCount,
      processingTime,
      privacyLevel: "medium",
    };
  }

  public constructor(
    config?: Partial<SearchableEncryptionConfig>,
    logger: ILogger = defaultLogger
  ) {
    super();
    this.config = { ...this.defaultConfig, ...config };
    this.logger = logger;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "initialize",
      {
        severity: "high",
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      await sodium.ready;

      this.logger.info("Initializing ZKIM Searchable Encryption Service", {
        config: this.config,
      });

      // Initialize ZKIM file service for persistence
      // File service is optional and can be injected later via setFileService()
      // this.zkimFileService = await ZKIMFileService.getServiceInstance();

      // Load existing file index from persistence
      await this.loadFileIndex();

      // Initialize OPRF system
      await this.initializeOPRF();

      // Start epoch management and auto-save
      // CRITICAL: Only start timers if NOT in test environment
      // Check BEFORE calling to prevent any timer creation
      if (
        !(
          (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
          typeof jest !== "undefined"
        )
      ) {
        this.startEpochManagement();
        this.startAutoSave();
      }

      this.isInitialized = true;
      this.logger.info(
        "ZKIM Searchable Encryption Service initialized successfully",
        {
          indexedFiles: this.fileIndex.size,
        }
      );
    }, context);
  }

  /**
   * Index a file for searchable encryption
   */
  public async indexFile(zkimFile: ZkimFile, userId: string): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "indexFile",
      {
        severity: "medium",
        userId,
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      const { fileId } = zkimFile.header;
      const objectId = await this.generateObjectId(zkimFile);

      // Generate search tokens from metadata
      const searchTokens = await this.generateSearchTokens(zkimFile.metadata);

      // Determine access level based on user permissions
      const accessLevel = this.determineAccessLevel(zkimFile, userId);

      const indexedFile = this.createIndexedFile(
        fileId,
        objectId,
        userId,
        zkimFile.metadata,
        searchTokens,
        Date.now(),
        Date.now()
      );

      // Add to index
      this.fileIndex.set(fileId, indexedFile);

      // Auto-save index after indexing
      await this.saveFileIndex();

      this.logger.info("File indexed for searchable encryption", {
        fileId,
        objectId,
        searchTokensCount: searchTokens.length,
        accessLevel,
        userId,
      });
    }, context);
  }

  /**
   * Search through encrypted files
   */
  public async search(
    query: SearchQuery,
    limit?: number
  ): Promise<SearchResult> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("SearchableEncryption", "search", {
      severity: "medium",
      userId: query.userId,
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      const startTime = performance.now();

      // Check rate limiting
      if (this.config.enableRateLimiting) {
        const rateLimitResult = await this.checkRateLimit(query.userId);
        if (!rateLimitResult.allowed) {
          throw new ServiceError(
            `Rate limit exceeded: ${rateLimitResult.message}`,
            {
              code: "RATE_LIMIT_EXCEEDED",
              details: {
                userId: query.userId,
                message: rateLimitResult.message,
              },
            }
          );
        }
      }

      // Generate search trapdoor
      const trapdoor = await this.generateTrapdoor(query);

      // Perform OPRF-based search
      const searchResults = await this.performOPRFSearch(
        trapdoor,
        query.userId,
        limit
      );

      // Apply privacy enhancement
      const enhancedResults = await this.applyPrivacyEnhancement(
        searchResults
      );

      // Add result padding if enabled
      const paddedResults = this.config.enableResultPadding
        ? await this.addResultPadding(enhancedResults)
        : enhancedResults;

      const processingTime = performance.now() - startTime;

      // Log query history
      if (this.config.enableQueryLogging) {
        this.logQueryHistory(query, paddedResults.length, processingTime);
      }

      const result: SearchResult = {
        queryId: query.queryId,
        results: paddedResults,
        totalResults: paddedResults.length,
        processingTime,
        privacyLevel: this.determinePrivacyLevel(query),
        metadata: {
          epoch: this.currentEpoch,
          trapdoorId: trapdoor.trapdoorId,
          privacyEnhancement: this.config.enablePrivacyEnhancement,
          resultPadding: this.config.enableResultPadding,
        },
      };

      this.logger.info("Search completed successfully", {
        queryId: query.queryId,
        userId: query.userId,
        query: query.query,
        resultCount: result.totalResults,
        processingTime: result.processingTime,
        privacyLevel: result.privacyLevel,
      });

      return result;
    }, context);

    if (!result.success) {
      // Preserve original error code if available (e.g., RATE_LIMIT_EXCEEDED)
      const errorCode = result.errorCode ?? "SEARCH_FAILED";
      throw new ServiceError(result.error ?? "Search failed", {
        code: errorCode,
        details: {
          error: result.error,
          operation: "search",
        },
      });
    }

    return result.data as SearchResult;
  }

  /**
   * Update file index when metadata changes
   */
  public async updateFileIndex(
    zkimFile: ZkimFile,
    userId: string
  ): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "updateFileIndex",
      {
        severity: "medium",
        userId,
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      const { fileId } = zkimFile.header;
      const existingIndex = this.fileIndex.get(fileId);

      if (existingIndex) {
        // Update existing index
        existingIndex.metadata = zkimFile.metadata;
        existingIndex.trapdoors = await this.generateSearchTokens(
          zkimFile.metadata
        );
        existingIndex.lastAccessed = Date.now();

        this.logger.info("File index updated", {
          fileId,
          userId,
          searchTokensCount: existingIndex.trapdoors.length,
        });
      } else {
        // Create new index
        await this.indexFile(zkimFile, userId);
      }
    }, context);
  }

  /**
   * Remove file from search index
   */
  public async removeFileFromIndex(fileId: string): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "removeFileFromIndex",
      {
        severity: "medium",
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      const removed = this.fileIndex.delete(fileId);

      if (removed) {
        // Auto-save index after removal
        await this.saveFileIndex();

        this.logger.info("File removed from search index", { fileId });
      } else {
        this.logger.warn("File not found in search index", { fileId });
      }
    }, context);
  }

  /**
   * Rotate trapdoors for enhanced privacy
   */
  public async rotateTrapdoors(): Promise<void> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "rotateTrapdoors",
      {
        severity: "medium",
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      if (!this.config.enableTrapdoorRotation) {
        this.logger.info("Trapdoor rotation is disabled");
        return;
      }

      const now = Date.now();
      let rotatedCount = 0;
      let expiredCount = 0;

      // Rotate active trapdoors
      for (const [, trapdoor] of this.trapdoors.entries()) {
        if (trapdoor.isRevoked) {
          continue;
        }

        if (now >= trapdoor.expiresAt) {
          // Expire trapdoor
          trapdoor.isRevoked = true;
          expiredCount++;
        } else if (trapdoor.usageCount >= trapdoor.maxUsage) {
          // Rotate trapdoor
          await this.rotateTrapdoor(trapdoor);
          rotatedCount++;
        }
      }

      this.logger.info("Trapdoor rotation completed", {
        rotatedCount,
        expiredCount,
        totalTrapdoors: this.trapdoors.size,
      });
    }, context);
  }

  /**
   * Generate OPRF token for a word (public API for indexing)
   * Used by message indexing service to generate privacy-preserving tokens
   */
  public async generateOPRFToken(word: string): Promise<string> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "generateOPRFToken",
      {
        severity: "medium",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      return await this.generateToken(word);
    }, context);

    if (!result.success) {
      throw new ServiceError(result.error ?? "Failed to generate OPRF token", {
        code: "OPRF_TOKEN_GENERATION_FAILED",
        details: {
          error: result.error,
          operation: "generateOPRFToken",
        },
      });
    }

    return result.data as string;
  }

  /**
   * Get search statistics
   */
  public async getSearchStats(): Promise<{
    totalIndexedFiles: number;
    totalTrapdoors: number;
    activeTrapdoors: number;
    queriesThisEpoch: number;
    averageQueryTime: number;
    privacyLevels: Record<string, number>;
  }> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "getSearchStats",
      {
        severity: "low",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      const activeTrapdoors = Array.from(this.trapdoors.values()).filter(
        (t) => !t.isRevoked
      ).length;
      const queriesThisEpoch = Array.from(this.queryHistory.values()).filter(
        (q) => q.timestamp >= this.epochStartTime
      ).length;

      const queryTimes = Array.from(this.queryHistory.values())
        .filter((q) => q.timestamp >= this.epochStartTime)
        .map((q) => q.processingTime);

      const averageQueryTime =
        queryTimes.length > 0
          ? queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length
          : 0;

      const privacyLevels = this.calculatePrivacyLevels();

      await Promise.resolve();
      return {
        totalIndexedFiles: this.fileIndex.size,
        totalTrapdoors: this.trapdoors.size,
        activeTrapdoors,
        queriesThisEpoch,
        averageQueryTime,
        privacyLevels,
      };
    }, context);

    if (!result.success) {
      throw new ServiceError(result.error ?? "Failed to get statistics", {
        code: "GET_STATISTICS_FAILED",
        details: {
          error: result.error,
          operation: "getStatistics",
        },
      });
    }

    return result.data as {
      totalIndexedFiles: number;
      totalTrapdoors: number;
      activeTrapdoors: number;
      queriesThisEpoch: number;
      averageQueryTime: number;
      privacyLevels: Record<string, number>;
    };
  }

  protected async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async initializeOPRF(): Promise<void> {
    await sodium.ready;

    // Generate OPRF secret key (32 bytes for Ristretto255)
    // In production, this should be derived from platform key or stored securely
    this.oprfSecretKey = sodium.randombytes_buf(32);

    this.logger.info("OPRF system initialized with ristretto255 curve", {
      secretKeyLength: this.oprfSecretKey.length,
    });
  }

  private startEpochManagement(): void {
    // CRITICAL: Never create timers in test environment
    // Simple inline check - no dynamic imports that could fail
    if (
      (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
      typeof jest !== "undefined"
    ) {
      this.logger.debug("Epoch management timer skipped in test environment");
      return;
    }

    // Clear existing timer if any
    if (this.epochTimer) {
      clearInterval(this.epochTimer);
      this.epochTimer = null;
    }
    
    this.epochTimer = setInterval(() => {
      this.advanceEpoch();
    }, this.config.epochDuration);

    this.logger.info("Epoch management started", {
      epochDuration: this.config.epochDuration,
    });
  }

  private advanceEpoch(): void {
    this.currentEpoch++;
    this.epochStartTime = Date.now();

    // Clean up expired trapdoors
    this.cleanupExpiredTrapdoors();

    // Reset query counters
    this.queryHistory.clear();

    this.logger.info("Epoch advanced", {
      newEpoch: this.currentEpoch,
      timestamp: this.epochStartTime,
    });
  }

  private async generateObjectId(zkimFile: ZkimFile): Promise<string> {
    const objectId = `obj_${zkimFile.header.fileId}_${Date.now()}`;
    await Promise.resolve();
    return objectId;
  }

  private async generateSearchTokens(
    metadata: ZkimFileMetadata
  ): Promise<string[]> {
    const tokens: string[] = [];

    // Generate tokens from file name
    if (metadata.fileName) {
      tokens.push(await this.generateToken(metadata.fileName));
    }

    // Generate tokens from MIME type
    if (metadata.mimeType) {
      tokens.push(await this.generateToken(metadata.mimeType));
    }

    // Generate tokens from tags
    if (metadata.tags) {
      for (const tag of metadata.tags) {
        tokens.push(await this.generateToken(tag));
      }
    }

    // Generate tokens from custom fields
    if (metadata.customFields) {
      for (const [key, value] of Object.entries(metadata.customFields)) {
        if (typeof value === "string") {
          tokens.push(await this.generateToken(`${key}:${value}`));
        }
      }
    }

    return tokens;
  }

  /**
   * Generate OPRF token using Ristretto255 curve
   * OPRF evaluation: F(k, x) = H(x) * k
   * 1. Hash input to uniform distribution (BLAKE3)
   * 2. Map hash to Ristretto255 point (hash as scalar × base point)
   * 3. Multiply by secret key scalar
   * 4. Return base64-encoded result
   */
  private async generateToken(data: string): Promise<string> {
    if (!this.oprfSecretKey) {
      throw new ServiceError("OPRF secret key not initialized", {
        code: "OPRF_NOT_INITIALIZED",
      });
    }

    const dataBytes = new TextEncoder().encode(data);
    const dataHash = blake3(dataBytes, { dkLen: 32 });

    const hashScalar = this.bytesToScalar(dataHash);
    const inputPoint = ristretto255.Point.BASE.multiply(hashScalar);

    const secretKeyScalar = this.bytesToScalar(this.oprfSecretKey);
    const resultPoint = inputPoint.multiply(secretKeyScalar);

    const resultBytes = resultPoint.toBytes();
    const token = sodium.to_base64(resultBytes);
    await Promise.resolve();
    return token;
  }

  /**
   * Convert bytes to scalar for Ristretto255
   * Clamps bytes to valid scalar range (mod curve order)
   */
  private bytesToScalar(bytes: Uint8Array): bigint {
    // Convert bytes to bigint (little-endian)
    const INITIAL_SCALAR = 0n;
    let scalar = INITIAL_SCALAR;
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte === undefined) {
        continue;
      }
      scalar |= BigInt(byte) << BigInt(i * 8);
    }

    // Clamp to valid scalar range (mod curve order)
    // Ristretto255 curve order is 2^252 + 27742317777372353535851937790883648493
    const curveOrder =
      7237005577332262213973186563042994240857116359379907606001950938285454250989n;
    return scalar % curveOrder;
  }

  /**
   * Generate OPRF trapdoor for search query
   * Same OPRF evaluation as generateToken, returns raw bytes instead of base64
   */
  private async generateOPRFTrapdoor(query: string): Promise<Uint8Array> {
    if (!this.oprfSecretKey) {
      throw new ServiceError("OPRF secret key not initialized", {
        code: "OPRF_NOT_INITIALIZED",
      });
    }

    const queryBytes = new TextEncoder().encode(query.toLowerCase());
    const queryHash = blake3(queryBytes, { dkLen: 32 });

    const queryHashScalar = this.bytesToScalar(queryHash);
    const queryPoint = ristretto255.Point.BASE.multiply(queryHashScalar);

    const secretKeyScalar = this.bytesToScalar(this.oprfSecretKey);
    const resultPoint = queryPoint.multiply(secretKeyScalar);

    const trapdoor = resultPoint.toBytes();
    await Promise.resolve();
    return trapdoor;
  }

  private determineAccessLevel(
    zkimFile: ZkimFile,
    userId: string
  ): "full" | "metadata" | "none" {
    const { accessControl } = zkimFile.metadata;

    if (!accessControl) {
      return "none";
    }

    if (accessControl.readAccess.includes(userId)) {
      return "full";
    }

    return "metadata";
  }

  private async checkRateLimit(userId: string): Promise<{
    allowed: boolean;
    message: string;
  }> {
    const userQueries = Array.from(this.queryHistory.values()).filter(
      (q) => q.userId === userId && q.timestamp >= this.epochStartTime
    );

    if (userQueries.length >= this.config.maxQueriesPerEpoch) {
      await Promise.resolve();
      return {
        allowed: false,
        message: `Maximum queries per epoch (${this.config.maxQueriesPerEpoch}) exceeded`,
      };
    }

    await Promise.resolve();
    return { allowed: true, message: "Rate limit check passed" };
  }

  private async generateTrapdoor(query: SearchQuery): Promise<Trapdoor> {
    const trapdoorId = await this.generateTrapdoorId();
    const now = Date.now();

    const trapdoor: Trapdoor = {
      trapdoorId,
      userId: query.userId,
      query: query.query,
      epoch: this.currentEpoch,
      expiresAt: now + this.config.epochDuration,
      usageCount: 0,
      maxUsage: 100,
      isRevoked: false,
    };

    this.trapdoors.set(trapdoorId, trapdoor);

    return trapdoor;
  }

  private async generateTrapdoorId(): Promise<string> {
    await sodium.ready;
    const randomBytes = sodium.randombytes_buf(16);
    return sodium.to_base64(randomBytes);
  }

  private async performOPRFSearch(
    trapdoor: Trapdoor,
    _userId: string,
    limit?: number
  ): Promise<ZkimFileSearchResult[]> {
    // Generate OPRF trapdoor for query
    const queryTrapdoor = await this.generateOPRFTrapdoor(trapdoor.query);

    const results: ZkimFileSearchResult[] = [];

    for (const [, indexedFile] of this.fileIndex.entries()) {
      // Check if user has access to this file
      const accessLevel = this.determineAccessLevel(
        {
          header: { fileId: indexedFile.fileId },
          metadata: indexedFile.metadata,
        } as ZkimFile,
        _userId
      );

      if (accessLevel === "none") {
        continue;
      }

      // Perform OPRF-based matching on encrypted trapdoors
      const matches = await this.matchesOPRFQuery(
        queryTrapdoor,
        indexedFile.trapdoors
      );

      if (matches) {
        results.push({
          fileId: indexedFile.fileId,
          objectId: indexedFile.objectId,
          relevance: this.calculateRelevance(trapdoor.query, indexedFile),
          metadata: indexedFile.metadata as Partial<ZkimFileMetadata>,
          accessLevel: accessLevel === "full" ? "full" : "metadata",
          lastAccessed: indexedFile.lastAccessed,
        });

        // Update usage count
        trapdoor.usageCount++;
        indexedFile.lastAccessed = Date.now();
        indexedFile.accessCount++;

        // Check limit
        if (limit && results.length >= limit) {
          break;
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  /**
   * Match OPRF trapdoor against indexed trapdoors using constant-time comparison
   * Prevents timing attacks by using sodium.memcmp for all comparisons
   */
  private async matchesOPRFQuery(
    queryTrapdoor: Uint8Array,
    indexedTrapdoors: string[]
  ): Promise<boolean> {
    const indexedTrapdoorBytes = indexedTrapdoors.map((token) =>
      sodium.from_base64(token)
    );

    for (const indexedTrapdoor of indexedTrapdoorBytes) {
      if (indexedTrapdoor.length === queryTrapdoor.length) {
        if (sodium.memcmp(queryTrapdoor, indexedTrapdoor)) {
          await Promise.resolve();
          return true;
        }
      }
    }

    await Promise.resolve();
    return false;
  }

  private calculateRelevance(query: string, indexedFile: IndexedFile): number {
    let score = 0;
    const queryLower = query.toLowerCase();

    if (indexedFile.metadata.fileName?.toLowerCase().includes(queryLower)) {
      score += 0.5;
    }

    if (
      indexedFile.metadata.tags?.some((tag: string) =>
        tag.toLowerCase().includes(queryLower)
      )
    ) {
      score += 0.3;
    }

    if (indexedFile.metadata.customFields) {
      for (const [, value] of Object.entries(
        indexedFile.metadata.customFields
      )) {
        if (
          typeof value === "string" &&
          value.toLowerCase().includes(queryLower)
        ) {
          score += 0.2;
          break;
        }
      }
    }

    return Math.min(score, 1.0);
  }

  private async applyPrivacyEnhancement(
    results: ZkimFileSearchResult[]
  ): Promise<ZkimFileSearchResult[]> {
    if (!this.config.enablePrivacyEnhancement) {
      return results;
    }

    const enhancedResults = [...results];

    // Add small random noise to relevance scores (±5%) to prevent relevance analysis
    for (const result of enhancedResults) {
      const noise = (await this.generateRandomFloat()) * 0.1 - 0.05;
      result.relevance = Math.max(0, Math.min(1, result.relevance + noise));
    }

    // Shuffle results to prevent ordering analysis
    await this.shuffleArray(enhancedResults);

    return enhancedResults;
  }

  private async addResultPadding(
    results: ZkimFileSearchResult[]
  ): Promise<ZkimFileSearchResult[]> {
    if (!this.config.enableResultPadding) {
      return results;
    }

    const targetBucket = this.selectTargetBucket(results.length);
    const paddingCount = targetBucket - results.length;

    if (paddingCount <= 0) {
      return results;
    }

    const paddingResults = await this.generatePaddingResults(paddingCount);

    const paddedResults = [...results, ...paddingResults];
    await this.shuffleArray(paddedResults);

    return paddedResults;
  }

  private selectTargetBucket(resultCount: number): number {
    for (const bucketSize of this.config.bucketSizes) {
      if (bucketSize >= resultCount) {
        return bucketSize;
      }
    }
    return this.config.bucketSizes[this.config.bucketSizes.length - 1] || 1;
  }

  private async generatePaddingResults(
    count: number
  ): Promise<ZkimFileSearchResult[]> {
    const paddingResults: ZkimFileSearchResult[] = [];

    for (let i = 0; i < count; i++) {
      paddingResults.push({
        fileId: `padding_${Date.now()}_${i}`,
        objectId: `padding_obj_${Date.now()}_${i}`,
        relevance: 0.1 + (await this.generateRandomFloat()) * 0.2, // Low relevance padding
        metadata: {
          fileName: `Padding File ${i + 1}`,
          mimeType: "application/octet-stream",
          tags: ["padding"],
        },
        accessLevel: "metadata",
        lastAccessed:
          Date.now() - (await this.generateRandomFloat()) * 86400000, // Random recent access
      });
    }

    return paddingResults;
  }

  private async generateRandomFloat(): Promise<number> {
    await sodium.ready;
    const randomBytes = sodium.randombytes_buf(4);
    const randomInt = new DataView(randomBytes.buffer).getUint32(0);
    return randomInt / 0xffffffff;
  }

  private async shuffleArray<T>(array: T[]): Promise<void> {
    // Fisher-Yates shuffle using cryptographically secure random
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor((await this.generateRandomFloat()) * (i + 1));
      const temp = array[i];
      const swapItem = array[j];
      if (temp === undefined || swapItem === undefined) {
        continue;
      }
      array[i] = swapItem;
      array[j] = temp;
    }
  }

  private determinePrivacyLevel(query: SearchQuery): "high" | "medium" | "low" {
    if (query.priority === "high") {
      return "high";
    }

    if (
      this.config.enablePrivacyEnhancement &&
      this.config.enableResultPadding
    ) {
      return "high";
    }

    if (this.config.enableRateLimiting) {
      return "medium";
    }

    return "low";
  }

  private async rotateTrapdoor(trapdoor: Trapdoor): Promise<void> {
    trapdoor.usageCount = 0;
    trapdoor.expiresAt = Date.now() + this.config.epochDuration;

    this.logger.info("Trapdoor rotated", {
      trapdoorId: trapdoor.trapdoorId,
      userId: trapdoor.userId,
    });

    await Promise.resolve();
  }

  private cleanupExpiredTrapdoors(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [trapdoorId, trapdoor] of this.trapdoors.entries()) {
      if (trapdoor.expiresAt < now) {
        this.trapdoors.delete(trapdoorId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info("Expired trapdoors cleaned up", { cleanedCount });
    }
  }

  private logQueryHistory(
    query: SearchQuery,
    resultCount: number,
    processingTime: number
  ): void {
    const entry = this.createQueryHistoryEntry(
      query.queryId,
      query.userId,
      query.query,
      query.timestamp,
      resultCount,
      processingTime
    );

    this.queryHistory.set(query.queryId, entry);
  }

  private calculatePrivacyLevels(): Record<string, number> {
    const levels: Record<string, number> = { high: 0, medium: 0, low: 0 };

    for (const query of this.queryHistory.values()) {
      if (!query) continue;

      const privacyLevel = this.determinePrivacyLevel({
        queryId: query.queryId,
        query: query.query,
        userId: query.userId,
        timestamp: query.timestamp,
        priority: "medium",
      });

      levels[privacyLevel] = (levels[privacyLevel] || 0) + 1;
    }

    return levels;
  }

  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext(
      "SearchableEncryption",
      "cleanup",
      {
        severity: "low",
      }
    );

    await ErrorUtils.withErrorHandling(async () => {
      // Always clear timers, regardless of state - idempotent cleanup
      // This ensures timers are cleared even if created during NODE_ENV override
      try {
        if (this.saveIndexTimer) {
          clearInterval(this.saveIndexTimer);
          this.saveIndexTimer = null;
        }
      } catch {
        // Ignore errors clearing timer - ensure we continue cleanup
        this.saveIndexTimer = null;
      }

      try {
        if (this.epochTimer) {
          clearInterval(this.epochTimer);
          this.epochTimer = null;
        }
      } catch {
        // Ignore errors clearing timer - ensure we continue cleanup
        this.epochTimer = null;
      }

      // Save file index (may fail, but we continue cleanup)
      // CRITICAL: Skip saveFileIndex in test environment to avoid async operations
      // that might keep the process alive
      if (
        !(
          (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
          typeof jest !== "undefined"
        )
      ) {
        try {
          await this.saveFileIndex();
        } catch (error) {
          // Log but don't throw - we want to complete cleanup
          this.logger.warn("Failed to save file index during cleanup", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Clear all data structures
      this.fileIndex.clear();
      this.trapdoors.clear();
      this.queryHistory.clear();
      this.oprfSecretKey = null;
      this.zkimFileService = null;
      
      // CRITICAL: Reset initialized state to allow re-initialization
      // This ensures services can be properly re-initialized after cleanup
      this.isInitialized = false;

      this.logger.info("ZKIM Searchable Encryption Service cleaned up");
    }, context);
  }

  /**
   * Load file index from persistence (browser: localStorage, Node.js: in-memory only)
   */
  private async loadFileIndex(): Promise<void> {
    try {
      if (
        isBrowser() &&
        typeof window !== "undefined" &&
        window.localStorage
      ) {
        // Try ZKIM file format first
        const zkimObjectId = localStorage.getItem("zkim-file-index-zkim");
        if (zkimObjectId && this.zkimFileService) {
          try {
            const result = await this.zkimFileService.getZkimFile(zkimObjectId);
            if (result.success && result.data) {
              await sodium.ready;
              const userKey = sodium.randombytes_buf(32);
              if (!this.zkimFileService.decryptZkimFile) {
                this.logger.warn("decryptZkimFile not available in file service");
              } else {
                const fileData = result.data;
                const decryptedData = await this.zkimFileService.decryptZkimFile(
                  fileData,
                  fileData.header.userId,
                  userKey
                );

                const indexData = JSON.parse(
                  new TextDecoder().decode(decryptedData)
                ) as { fileIndex?: Record<string, IndexedFile> };

                if (indexData.fileIndex) {
                  for (const [fileId, indexedFile] of Object.entries(
                    indexData.fileIndex
                  )) {
                    this.fileIndex.set(fileId, indexedFile);
                  }
                }

                this.logger.info("File index loaded from persistence", {
                  indexedFiles: this.fileIndex.size,
                });
                return;
              }
            }
          } catch (error) {
            this.logger.warn("Failed to load file index from ZKIM file", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const storedIndex = localStorage.getItem("zkim-file-index");
        if (storedIndex) {
          try {
            const indexData = JSON.parse(storedIndex) as {
              fileIndex?: Record<string, IndexedFile>;
            };
            if (indexData.fileIndex) {
              for (const [fileId, indexedFile] of Object.entries(
                indexData.fileIndex
              )) {
                this.fileIndex.set(fileId, indexedFile);
              }
            }
            this.logger.info("File index loaded from localStorage", {
              indexedFiles: this.fileIndex.size,
            });
          } catch (error) {
            this.logger.warn("Failed to load file index from localStorage", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } else if (!isBrowser()) {
        this.logger.info(
          "File index persistence not available in Node.js (in-memory only)"
        );
      }
    } catch (error) {
      this.logger.warn("Failed to load file index", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save file index to persistence (browser: localStorage as ZKIM file, Node.js: in-memory only)
   */
  private async saveFileIndex(): Promise<void> {
    try {
      if (
        isBrowser() &&
        typeof window !== "undefined" &&
        window.localStorage &&
        this.zkimFileService
      ) {
        const indexData = {
          fileIndex: Object.fromEntries(this.fileIndex),
          stats: {
            totalIndexedFiles: this.fileIndex.size,
            lastSaved: Date.now(),
          },
          timestamp: Date.now(),
        };

        await sodium.ready;
        const platformKey = sodium.randombytes_buf(32);
        const userKey = sodium.randombytes_buf(32);

        if (!this.zkimFileService.createZkimFile) {
          this.logger.warn("createZkimFile not available in file service, skipping save");
          return;
        }
        const zkimResult = await this.zkimFileService.createZkimFile(
          new TextEncoder().encode(JSON.stringify(indexData)),
          "file-indexing",
          platformKey,
          userKey,
          {
            fileName: `file-index-${Date.now()}.zkim`,
            customFields: {
              indexType: "file-index",
              indexedFilesCount: this.fileIndex.size,
            },
            tags: ["indexes", "file-indexing", "search"],
            userId: "file-indexing",
          }
        );

        if (zkimResult.success && zkimResult.data) {
          // Use fileId as objectId since the interface doesn't expose objectId
          const objectId = zkimResult.data.header.fileId;
          localStorage.setItem("zkim-file-index-zkim", objectId);

          this.logger.debug("File index saved to persistence", {
            indexedFiles: this.fileIndex.size,
            objectId,
          });
        }
      } else if (!isBrowser()) {
        this.logger.debug(
          "File index persistence not available in Node.js (in-memory only)"
        );
      }
    } catch (error) {
      this.logger.warn("Failed to save file index", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startAutoSave(): void {
    // CRITICAL: Never create timers in test environment
    // Simple inline check - no dynamic imports that could fail
    if (
      (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
      typeof jest !== "undefined"
    ) {
      this.logger.debug("Auto-save timer skipped in test environment");
      return;
    }

    const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes in production

    if (this.saveIndexTimer) {
      clearInterval(this.saveIndexTimer);
    }

    this.saveIndexTimer = setInterval(() => {
      this.saveFileIndex().catch((error) => {
        this.logger.warn("Auto-save file index failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, AUTO_SAVE_INTERVAL);

    this.logger.info("Auto-save timer started", {
      interval: AUTO_SAVE_INTERVAL,
    });
  }
}

