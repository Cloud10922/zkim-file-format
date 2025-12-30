/**
 * ZKIM File Format Types - Single Source of Truth
 * 
 * This file contains all ZKIM file format-related types including core file format,
 * archive format, message format, and service configuration types.
 */

// ===== CORE ZKIM FILE FORMAT TYPES =====
// Types related to the core ZKIM file format specification.

/**
 * ZKIM File Header Interface
 */
export interface ZkimFileHeader {
  magic: "ZKIM";
  version: number;
  flags: number;
  platformKeyId: string;
  userId: string;
  fileId: string;
  createdAt: number;
  chunkCount: number;
  totalSize: number;
  compressionType: number;
  encryptionType: number;
  hashType: number;
  signatureType: number;
}

/**
 * ZKIM File Chunk Interface
 */
export interface ZkimFileChunk {
  chunkIndex: number;
  chunkSize: number;
  compressedSize: number;
  encryptedSize: number;
  nonce: Uint8Array;
  encryptedData: Uint8Array;
  integrityHash: Uint8Array;
  padding: Uint8Array;
}

/**
 * Base File Metadata Interface
 * Used as base for ZKIM file metadata
 */
export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  hash: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  accessControl?: {
    readAccess: string[];
    writeAccess: string[];
    deleteAccess: string[];
  };
  retentionPolicy?: {
    expiresAt?: number;
    maxAccessCount?: number;
    autoDelete?: boolean;
  };
}

/**
 * ZKIM File Metadata Interface
 * Extends base FileMetadata with ZKIM-specific fields
 */
export interface ZkimFileMetadata
  extends Omit<FileMetadata, "id" | "name" | "size" | "hash" | "updatedAt"> {
  fileName: string; // Maps to name in base interface - required
  customFields?: Record<string, unknown>;
  userId?: string;
  createdAt: number; // Required field
  // Inherits: mimeType, tags, accessControl, retentionPolicy
}

/**
 * ZKIM File Interface
 */
export interface ZkimFile {
  header: ZkimFileHeader;
  chunks: ZkimFileChunk[];
  metadata: ZkimFileMetadata;
  platformSignature: Uint8Array;
  userSignature: Uint8Array;
  contentSignature: Uint8Array;
}

/**
 * ZKIM File Result Interface
 */
export interface ZkimFileResult {
  success: boolean;
  file: ZkimFile;
  zkimFile: ZkimFile; // Alias for file property for backward compatibility
  objectId: string;
  size: number;
  chunks: number;
  processingTime: number;
  compressionRatio: number;
  encryptionOverhead: number;
}

/**
 * ZKIM File Search Result Interface
 */
export interface ZkimFileSearchResult {
  fileId: string;
  objectId: string;
  relevance: number;
  metadata: Partial<ZkimFileMetadata>;
  accessLevel: "full" | "metadata" | "none";
  lastAccessed: number;
}

/**
 * ZKIM File Configuration Interface
 */
export interface ZkimFileConfig {
  enableCompression: boolean;
  enableDeduplication: boolean;
  chunkSize: number;
  compressionLevel: number;
  encryptionType: number;
  hashType: number;
  signatureType: number;
  enableSearchableEncryption: boolean;
  enableIntegrityValidation: boolean;
  enableMetadataIndexing: boolean;
}

/**
 * ZKIM Error Interface
 */
export interface ZkimError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
  severity: "low" | "medium" | "high" | "critical";
  context?: Record<string, unknown>;
}

/**
 * ZKIM Content Interface
 */
export interface ZKIMContent {
  id: string;
  type: "file" | "message" | "data";
  content: Uint8Array;
  metadata?: Record<string, unknown>;
  encrypted: boolean;
  compressed: boolean;
}

// ===== ZCAR ARCHIVE FORMAT TYPES =====
// Types related to ZKIM Archive (ZCAR) format.

/**
 * ZCAR Header Interface
 */
export interface ZCARHeader {
  magic: string; // "ZKAR" (ZKIM Archive)
  version: number; // Format version
  flags: number; // Feature flags
  manifestOffset: number; // Manifest location in file
  manifestSize: number; // Manifest size in bytes
  totalSize: number; // Total archive size
  createdAt: number; // Creation timestamp
  algorithm: string; // Hash algorithm used
  compression: string; // Compression algorithm
  // Additional properties for compatibility
  manifest?: ZCARManifest;
}

/**
 * ZCAR Manifest Interface
 */
export interface ZCARManifest {
  id: string;
  name: string;
  type: string;
  version: number;
  blocks: ZCARBlock[];
  metadata: ZCARMetadata;
  integrity: ZCARIntegrity;
  // Additional properties for compatibility
  createdAt: number;
  updatedAt: number;
}

/**
 * ZCAR Block Interface
 */
export interface ZCARBlock {
  id: string;
  data: Uint8Array;
  compressed: boolean;
  encrypted: boolean;
  objectId: string;
  offset: number;
  size: number;
  compressedSize: number;
  checksum: string;
  flags: number;
  // Additional properties for compatibility
  manifest?: ZCARManifest;
}

/**
 * ZCAR Metadata Interface
 */
export interface ZCARMetadata {
  name: string; // Required field
  description?: string;
  tags?: string[];
  created: number;
  modified: number;
  creator?: string;
  permissions?: number;
  custom?: Record<string, unknown>;
}

/**
 * ZCAR Integrity Interface
 */
export interface ZCARIntegrity {
  merkleRoot: string;
  signature: string;
  publicKey: string;
  timestamp: number;
}

/**
 * ZCAR File Interface
 */
export interface ZCARFile {
  header: ZCARHeader;
  manifest: ZCARManifest;
  data: Uint8Array;
}

/**
 * ZCAR Configuration Interface
 */
export interface ZCARConfig {
  enableCompression: boolean;
  compressionLevel: number;
  enableEncryption: boolean;
  enableIntegrity: boolean;
  blockSize: number;
  enableStreaming: boolean;
}

// ===== ZKIM SERVICE CONFIGURATION TYPES =====
// Types related to ZKIM service configuration and management.

/**
 * ZKIM File Service Configuration Interface
 */
export interface ZKIMFileServiceConfig {
  enableCompression: boolean;
  enableDeduplication: boolean;
  chunkSize: number;
  compressionLevel: number;
  compressionAlgorithm: "brotli" | "gzip";
  enableSearchableEncryption: boolean;
  enableIntegrityValidation: boolean;
  enableMetadataIndexing: boolean;
  maxFileSize: number;
  enableStreaming: boolean;
}

/**
 * ZKIM Encryption Configuration Interface
 */
export interface ZkimEncryptionConfig {
  enableThreeLayerEncryption: boolean;
  enableKeyRotation: boolean;
  enablePerfectForwardSecrecy: boolean;
  enableCompromiseDetection: boolean;
  defaultAlgorithm: "xchacha20-poly1305" | "aes-256-gcm";
  keySize: number;
  nonceSize: number;
  compressionEnabled: boolean;
  compressionAlgorithm: "brotli" | "gzip";
  compressionLevel: number;
  // Additional properties used by encryption manager
  algorithm?: string;
  keyRotationInterval?: number;
  maxKeyAge?: number;
  enableKeyValidation?: boolean;
  enablePerformanceOptimization?: boolean;
}

/**
 * Encryption Key Interface
 * Represents an encryption key with metadata and lifecycle information
 */
export interface EncryptionKey {
  keyId: string;
  key: Uint8Array;
  algorithm: string;
  createdAt: number;
  expiresAt?: number;
  usage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * ZKIM Integrity Configuration Interface
 */
export interface ZkimIntegrityConfig {
  enableHeaderValidation: boolean;
  enableChunkValidation: boolean;
  enableSignatureValidation: boolean;
  enableMetadataValidation: boolean;
  enableTamperDetection: boolean;
  validationThreshold: number;
  enableAuditLogging: boolean;
  enablePerformanceMetrics: boolean;
  hashAlgorithm: "blake3" | "sha256" | "sha512";
  signatureAlgorithm: "ed25519" | "ecdsa" | "rsa";
}

/**
 * ZKIM Platform Configuration Interface
 */
export interface ZKIMPlatformConfig {
  enableP2P: boolean;
  enableCAS: boolean;
  enableEncryption: boolean;
  enableCompression: boolean;
  maxFileSize: number;
  enableStreaming: boolean;
  metadata?: Record<string, unknown>;
}

// ===== COMPRESSION AND ENCRYPTION TYPES =====
// Types related to compression and encryption operations.

/**
 * Compression Configuration Interface
 */
export interface CompressionConfig {
  algorithm: "lz4" | "zstd" | "brotli" | "gzip";
  level: number;
  enableDictionary: boolean;
  enableStreaming: boolean;
  maxDictionarySize: number;
  enableAdaptiveCompression: boolean;
}

/**
 * Compression Result Interface
 */
export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  compressedData: Uint8Array;
  compressionRatio: number;
  compressionTime: number;
  decompressionTime: number;
  algorithm: string;
  level: number;
}

/**
 * Integrity Validation Result Interface
 */
export interface IntegrityValidationResult {
  isValid: boolean;
  validationLevel: "none" | "basic" | "full";
  headerValid: boolean;
  chunksValid: boolean;
  signaturesValid: boolean;
  metadataValid: boolean;
  errors: string[];
  warnings: string[];
  validationTime: number;
}

/**
 * Integrity Configuration Interface
 */
export interface IntegrityConfig {
  enableHeaderValidation: boolean;
  enableChunkValidation: boolean;
  enableSignatureValidation: boolean;
  enableMetadataValidation: boolean;
  enableTamperDetection: boolean;
  validationThreshold: number;
  enableAuditLogging: boolean;
}

// ===== ALGORITHM TYPES =====
// Types related to cryptographic and compression algorithms.

export type CompressionAlgorithm = "lz4" | "zstd" | "brotli" | "gzip";
export type EncryptionAlgorithm =
  | "xchacha20-poly1305"
  | "aes-256-gcm"
  | "chacha20-poly1305";
export type HashAlgorithm = "blake3" | "sha256" | "sha512";
export type SignatureAlgorithm = "ed25519" | "ecdsa" | "rsa";

/**
 * Algorithm Registry Interface
 */
export interface AlgorithmRegistry {
  compression: Record<CompressionAlgorithm, number>;
  encryption: Record<EncryptionAlgorithm, number>;
  hash: Record<HashAlgorithm, number>;
  signature: Record<SignatureAlgorithm, number>;
}

// ===== ENCRYPTION TYPES =====
// Types related to encryption operations.

/**
 * Encryption Core Interface
 */
export interface EncryptionCore {
  encrypt(data: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
  decrypt(encryptedData: Uint8Array, key: Uint8Array): Promise<Uint8Array>;
  generateKey(): Promise<Uint8Array>;
  deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>;
}

/**
 * Encryption Result
 */
export interface EncryptionResult {
  success: boolean;
  encryptedData?: Uint8Array;
  key?: Uint8Array;
  nonce?: Uint8Array;
  tag?: Uint8Array;
  error?: string;
}

// ===== CONTENT ADDRESSABLE STORAGE TYPES =====
// Types related to CAS operations.

/**
 * Content Result Interface
 */
export interface ContentResult {
  success: boolean;
  objectId: string;
  size: number;
  chunks: number;
  metadata: Record<string, unknown>;
}

/**
 * Content Retrieval Result Interface
 */
export interface ContentRetrievalResult {
  success: boolean;
  data: Uint8Array;
  objectId: string;
  size: number;
  chunks: number;
  metadata?: Record<string, unknown>;
}

/**
 * CAS Configuration Interface
 */
export interface CASConfig {
  enableCompression: boolean;
  enableDeduplication: boolean;
  chunkSize: number;
  hashAlgorithm: number;
}

// ===== SEARCHABLE ENCRYPTION TYPES =====
// Types related to searchable encryption functionality within ZKIM files.

/**
 * Searchable Encryption Configuration Interface
 */
export interface SearchableEncryptionConfig {
  enableOPRF: boolean;
  enableRateLimiting: boolean;
  enableQueryBatching: boolean;
  enableTrapdoorRotation: boolean;
  epochDuration: number;
  maxQueriesPerEpoch: number;
  bucketSizes: number[];
  minCoverage: number;
  enablePrivacyEnhancement: boolean;
  enableResultPadding: boolean;
  enableQueryLogging: boolean;
}

/**
 * Indexed File Interface
 */
export interface IndexedFile {
  fileId: string;
  objectId: string;
  userId: string;
  metadata: ZkimFileMetadata;
  trapdoors: string[];
  indexedAt: number;
  lastAccessed: number;
  accessCount: number;
  privacyLevel: "high" | "medium" | "low";
}

/**
 * Query History Entry Interface
 */
export interface QueryHistoryEntry {
  queryId: string;
  query: string;
  userId: string;
  timestamp: number;
  resultsCount: number;
  processingTime: number;
  privacyLevel: "high" | "medium" | "low";
  trapdoorId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Search Query Interface
 */
export interface SearchQuery {
  queryId: string;
  query: string;
  userId: string;
  timestamp: number;
  priority: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
}

/**
 * Search Result Interface
 */
export interface SearchResult {
  queryId: string;
  results: ZkimFileSearchResult[];
  totalResults: number;
  processingTime: number;
  privacyLevel: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
}

/**
 * Trapdoor Interface
 */
export interface Trapdoor {
  trapdoorId: string;
  userId: string;
  query: string;
  epoch: number;
  expiresAt: number;
  usageCount: number;
  maxUsage: number;
  isRevoked: boolean;
}

/**
 * Query Batch Configuration Interface
 */
export interface QueryBatchConfig {
  enableBatching: boolean;
  batchSize: number;
  batchTimeout: number;
  maxConcurrentBatches: number;
  enableLoadBalancing: boolean;
  enableQueryOptimization: boolean;
}

/**
 * Query Batch Interface
 */
export interface QueryBatch {
  batchId: string;
  queries: SearchQuery[];
  createdAt: number;
  status: "pending" | "processing" | "completed" | "failed";
  results: SearchResult[];
  processingTime: number;
  errorCount: number;
}

/**
 * Trapdoor Rotation Configuration Interface
 */
export interface TrapdoorRotationConfig {
  enableRotation: boolean;
  rotationInterval: number;
  gracePeriod: number;
  enableRevocation: boolean;
  maxActiveTrapdoors: number;
  enableUsageTracking: boolean;
}

/**
 * Trapdoor Rotation Event Interface
 */
export interface TrapdoorRotationEvent {
  eventId: string;
  userId: string;
  trapdoorId: string;
  eventType: "created" | "rotated" | "revoked" | "expired";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Usage Pattern Interface
 */
export interface UsagePattern {
  userId: string;
  queryPatterns: string[];
  usageFrequency: number;
  lastUsed: number;
  totalUsage: number;
  anomalyScore: number;
}

/**
 * Anomaly Detector Class
 */
export class AnomalyDetector {
  public detectAnomaly(
    usagePattern: UsagePattern,
    currentUsage: number
  ): { isAnomaly: boolean; score: number; reason: string } {
    // Simplified anomaly detection (will be enhanced in Phase 2)
    const baselineUsage = usagePattern.usageFrequency;
    const deviation = Math.abs(currentUsage - baselineUsage) / baselineUsage;

    const ANOMALY_THRESHOLD = 0.5;
    if (deviation > ANOMALY_THRESHOLD) {
      return {
        isAnomaly: true,
        score: deviation,
        reason: `Usage deviation of ${(deviation * 100).toFixed(1)}% detected`,
      };
    }

    return {
      isAnomaly: false,
      score: deviation,
      reason: "Usage within normal parameters",
    };
  }
}

/**
 * Cached Result Interface
 */
export interface CachedResult {
  result: SearchResult;
  timestamp: number;
  accessCount: number;
}

/**
 * Query Batcher Performance Metrics Interface
 */
export interface QueryBatcherPerformanceMetrics {
  totalBatches: number;
  totalQueries: number;
  totalProcessingTime: number;
  successfulQueries: number;
  failedQueries: number;
  averageProcessingTime: number;
  successRate: number;
  averageBatchTime: number;
  averageQueryTime: number;
  cacheHitRate: number;
  loadBalancingEfficiency: number;
  updateBatchMetrics(batchTime: number): void;
  updateQueryMetrics(queryTime: number, success: boolean): void;
  reset(): void;
}

/**
 * Metadata With Access Level Interface
 */
export interface MetadataWithAccessLevel {
  fileName?: string;
  accessLevel?: string;
  [key: string]: unknown;
}

// ===== ZKIM OBJECT IDENTIFIER TYPES =====
// Types related to ZKIM object identification and addressing.

/**
 * ZKIM Object Identifier (ZOID) Interface
 */
export interface ZOID {
  string: string;
  bytes: Uint8Array;
}

// ===== STORAGE BACKEND TYPES =====
// Types related to storage backend configuration and management.

/**
 * ZKIM Storage Backend Configuration Interface
 */
export interface ZKIMStorageBackendConfig {
  enableCompression: boolean;
  enableDeduplication: boolean;
  chunkSize: number;
  compressionLevel: number;
  compressionAlgorithm: "brotli" | "gzip";
  enableSearchableEncryption: boolean;
  enableIntegrityValidation: boolean;
  enableMetadataIndexing: boolean;
  maxFileSize: number;
  enableStreaming: boolean;
  storageProvider: "local" | "s3" | "custom";
  storageConfig?: Record<string, unknown>;
  // Additional properties for compatibility
  s3Persistence?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
  };
  localCache?: {
    maxSize: number;
    ttl: number;
    enablePersistence: boolean;
  };
  storageStrategy?: "hybrid" | "local" | "remote";
}

