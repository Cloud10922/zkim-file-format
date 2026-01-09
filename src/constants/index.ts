/**
 * ZKIM File Format Constants
 * Single source of truth for all file format-related constants
 *
 * Uses NIST-standardized post-quantum algorithms (FIPS 203/204).
 * NOT FIPS 140-3 validated by an accredited laboratory.
 */

/**
 * ZKIM Encryption Constants
 */
export const ZKIM_ENCRYPTION_CONSTANTS = {
  DEFAULT_ALGORITHM: "xchacha20-poly1305",
  KEY_SIZE: 32,
  NONCE_SIZE: 24,
  TAG_SIZE: 16, // AEAD tag size for XChaCha20-Poly1305
  SALT_LENGTH: 32,
  ITERATIONS: 100000,
  KEY_ROTATION_INTERVAL: 7 * 24 * 60 * 60 * 1000, // 7 days
  MAX_KEY_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days
  // ML-DSA-65 (FIPS 204)
  ML_DSA_65_PUBLIC_KEY_SIZE: 1952, // ML-DSA-65 public key size
  ML_DSA_65_SECRET_KEY_SIZE: 4032, // ML-DSA-65 secret key size
  ML_DSA_65_SIGNATURE_SIZE: 3309, // ML-DSA-65 signature size
  // ML-KEM-768 (FIPS 203)
  ML_KEM_768_PUBLIC_KEY_SIZE: 1184, // ML-KEM-768 public key size
  ML_KEM_768_SECRET_KEY_SIZE: 2400, // ML-KEM-768 secret key size
  ML_KEM_768_CIPHERTEXT_SIZE: 1088, // ML-KEM-768 ciphertext size
  // Wire format header sizes
  EH_HEADER_SIZE: 40, // EH_PLATFORM/EH_USER header size (nonce24 + tag16)
  MAGIC_BYTES_SIZE: 4, // ZKIM magic bytes "ZKIM"
  VERSION_BYTES_SIZE: 2, // Version field size
  FLAGS_BYTES_SIZE: 2, // Flags field size
  MERKLE_ROOT_SIZE: 32, // BLAKE3 hash size
  // Signature size
  SIGNATURE_SIZE: 3309, // ML-DSA-65 signature size (FIPS 204)
  // Version identifier
  VERSION: 0x0001, // Format version
  // Magic bytes
  MAGIC: "ZKIM", // Magic bytes identifier
  // Algorithm Suite ID: ML-KEM-768 (FIPS 203) + XChaCha20-Poly1305 + ML-DSA-65 (FIPS 204) + BLAKE3
  ALG_SUITE_ID: 0x01,
  // Worker settings
  WORKER_BATCH_SIZE: 25,
  WORKER_BATCH_INTERVAL_MS: 25,
} as const;

/**
 * ZKIM File Service Constants
 */
export const ZKIM_FILE_SERVICE_CONSTANTS = {
  COMPRESSION_TYPE_MAP: {
    brotli: 1,
    gzip: 2,
  },
  COMPRESSION_TYPE_REVERSE_MAP: {
    1: "brotli",
    2: "gzip",
  },
  DEFAULT_MAGIC: "ZKIM",
  DEFAULT_VERSION: 1,
  NONCE_PREFIX: "zkim/nonce",
  KEY_PREFIX: "zkim/key",
  USER_KEY_PREFIX: "zkim/userkey",
} as const;

/**
 * File Processing Constants
 */
export const FILE_PROCESSING_CONSTANTS = {
  DEFAULT_CHUNK_SIZE: 512 * 1024, // 512 KiB
  MAX_CHUNK_SIZE: 1024 * 1024, // 1MB
  MIN_CHUNK_SIZE: 1024, // 1KB
  DEFAULT_MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB
  COMPRESSION_LEVEL: 6,
  DEFAULT_COMPRESSION_ALGORITHM: "gzip",
  MAX_METADATA_SIZE: 64 * 1024, // 64KB
} as const;

/**
 * Service Lifecycle Constants
 */
export const ZKIM_SERVICE_LIFECYCLE_CONSTANTS = {
  INITIALIZATION_TIMEOUT: 30000, // 30 seconds
  CLEANUP_TIMEOUT: 10000, // 10 seconds
  MAX_INITIALIZATION_RETRIES: 3,
  HEALTH_CHECK_INTERVAL: 60000, // 1 minute
} as const;

/**
 * ZKIM Binary Format Constants
 *
 * v1 Magic bytes: "ZKIM" (Z=0x5a, K=0x4b, I=0x49, M=0x4d)
 */
export const ZKIM_BINARY_CONSTANTS = {
  // v1 Magic bytes
  MAGIC_BYTE_Z: 0x5a,
  MAGIC_BYTE_K: 0x4b,
  MAGIC_BYTE_I: 0x49,
  MAGIC_BYTE_M: 0x4d,
  MAGIC_BYTES: new Uint8Array([0x5a, 0x4b, 0x49, 0x4d]), // "ZKIM"
  VERSION: 1, // Format version
  HEADER_SIZE: 16,
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB
  CHUNK_SIZE: 64 * 1024, // 64KB
} as const;

/**
 * ZKIM Post-Quantum Constants
 * NIST-standardized algorithms: FIPS 203 (ML-KEM-768), FIPS 204 (ML-DSA-65)
 */
export const ZKIM_POST_QUANTUM_CONSTANTS = {
  // Algorithm identifiers
  KEM_ALGORITHM: "ML-KEM-768",
  DSA_ALGORITHM: "ML-DSA-65",
  HASH_ALGORITHM: "BLAKE3",
  // NIST standards
  KEM_STANDARD: "FIPS-203",
  DSA_STANDARD: "FIPS-204",
  // Key sizes
  ML_KEM_768_PUBLIC_KEY: 1184,
  ML_KEM_768_SECRET_KEY: 2400,
  ML_KEM_768_CIPHERTEXT: 1088,
  ML_KEM_768_SHARED_SECRET: 32,
  // Signature sizes
  ML_DSA_65_PUBLIC_KEY: 1952,
  ML_DSA_65_SECRET_KEY: 4032,
  ML_DSA_65_SIGNATURE: 3309,
} as const;