/**
 * @zkim-platform/file-format - ZKIM Secure File Format
 * 
 * A secure, encrypted file format with three-layer encryption,
 * integrity validation, and privacy-preserving search capabilities.
 * 
 * @packageDocumentation
 */

// ===== Core Services =====
export { ZKIMFileService } from "./core/zkim-file-service";
export { ZkimEncryption } from "./core/zkim-encryption";
export { ZkimIntegrity } from "./core/zkim-integrity";
export { SearchableEncryption } from "./core/searchable-encryption";
export { TrapdoorRotator } from "./core/trapdoor-rotator";
export { QueryBatcher } from "./core/query-batcher";
export { ZkimErrorRecovery } from "./core/zkim-error-recovery";
export { ZkimPerformanceMonitor } from "./core/zkim-performance-monitor";

// ===== Core Utilities =====
export {
  writeWireFormat,
  parseZkimFile,
  formatEhHeader,
  generateFileSignature,
  calculateMerkleRoot,
  calculateManifestHash,
  writeU16,
  readU16,
} from "./core/zkim-file-wire-format";

// ===== Encryption Interface =====
export type { IEncryptionService } from "./core/encryption-interface";

// ===== Types =====
export type {
  // File Format Types
  ZkimFile,
  ZkimFileHeader,
  ZkimFileChunk,
  ZkimFileMetadata,
  ZkimFileResult,
  ZKIMFileServiceConfig,
  ZkimEncryptionConfig,
  ZkimIntegrityConfig,
  SearchableEncryptionConfig,
  
  // Search Types
  SearchQuery,
  SearchResult,
  IndexedFile,
  Trapdoor,
  QueryHistoryEntry,
  ZkimFileSearchResult,
  
  // Query Batching Types
  QueryBatch,
  QueryBatchConfig,
  QueryBatcherPerformanceMetrics,
  CachedResult,
  MetadataWithAccessLevel,
  
  // Trapdoor Rotation Types
  TrapdoorRotationConfig,
  TrapdoorRotationEvent,
  UsagePattern,
  
  // Error Recovery Types
  IntegrityValidationResult,
  
  // Storage Types
  IStorageBackend,
  
  // Error Types
  ErrorContext,
  ServiceResult,
} from "./types";

export {
  // Error Classes
  ServiceError,
  ZKIMFileError,
  ZKIMEncryptionError,
  ZKIMIntegrityError,
  ZKIMStorageError,
  
  // Storage Implementations
  InMemoryStorage,
  LocalStorageBackend,
  
  // Anomaly Detector
  AnomalyDetector,
} from "./types";

// Error Recovery Types (from zkim-error-recovery)
export type {
  ZkimRecoveryResult,
  ZkimCorruptionDetection,
  ZkimRepairStrategy,
} from "./core/zkim-error-recovery";

// Performance Monitoring Types (from zkim-performance-monitor)
export type {
  ZkimPerformanceMetrics,
  ZkimPerformanceStats,
  ZkimPerformanceThresholds,
} from "./core/zkim-performance-monitor";

// ===== Utilities =====
export {
  // Logger
  defaultLogger,
  ConsoleLogger,
  type ILogger,
} from "./utils/logger";

export {
  // Error Handling
  ErrorUtils,
} from "./utils/error-handling";

export {
  // Singleton Base Classes
  SingletonBase,
  ServiceBase,
} from "./utils/singleton-base";

export {
  // Crypto Utilities
  generateRandomBytes,
  generateRandomHex,
  hashData,
  hashDataToHex,
  generateKeyPair,
  generateSigningKeyPair,
  encryptData,
  decryptData,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
} from "./utils/crypto";

export {
  // Compression Utilities
  compressGzip,
  decompressGzip,
} from "./utils/compression-utils";

export {
  // Constant-Time Security
  ConstantTimeSecurity,
} from "./utils/constant-time-security";

// ===== Constants =====
export {
  ZKIM_ENCRYPTION_CONSTANTS,
  ZKIM_FILE_SERVICE_CONSTANTS,
  FILE_PROCESSING_CONSTANTS,
  ZKIM_SERVICE_LIFECYCLE_CONSTANTS,
  ZKIM_BINARY_CONSTANTS,
} from "./constants";

// ===== Version =====
export const VERSION = "1.0.0";
