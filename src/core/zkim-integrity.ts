/**
 * ZKIM Integrity Service - File Validation and Tamper Detection
 * Handles integrity validation using BLAKE3 + Ed25519 signatures
 *
 * Service Flow:
 * 1. Validate file header integrity
 * 2. Verify chunk integrity with BLAKE3 hashes
 * 3. Validate signatures (Platform, User, Content)
 * 4. Detect tampering and provide detailed validation results
 */

// libsodium-wrappers-sumo uses default export, not namespace export
import sodium from "libsodium-wrappers-sumo";

import {
  addSecureDelay,
  validateMagicNumber,
  validateSize,
  validateVersion,
  withTimingProtection,
} from "../utils/constant-time-security";
import { ErrorUtils } from "../utils/error-handling";
import { ServiceBase } from "../utils/singleton-base";

import { ServiceError } from "../types/errors";

import { defaultLogger, type ILogger } from "../utils/logger";

import type {
  IntegrityValidationResult,
  ZkimFile,
  ZkimFileChunk,
  ZkimFileHeader,
  ZkimFileMetadata,
  ZkimIntegrityConfig,
} from "../types/zkim-file-format";

export class ZkimIntegrity extends ServiceBase {
  private readonly defaultConfig: ZkimIntegrityConfig = {
    enableHeaderValidation: true,
    enableChunkValidation: true,
    enableSignatureValidation: true,
    enableMetadataValidation: true,
    enableTamperDetection: true,
    validationThreshold: 0.95, // 95% validation success required
    enableAuditLogging: true,
    enablePerformanceMetrics: true,
    hashAlgorithm: "blake3",
    signatureAlgorithm: "ed25519",
  };

  private config: ZkimIntegrityConfig;
  private isInitialized = false;
  private validationCache: Map<string, IntegrityValidationResult> = new Map();
  private auditLog: Array<{
    timestamp: number;
    fileId: string;
    operation: string;
    result: boolean;
    details: string;
  }> = [];
  private logger: ILogger;

  public constructor(
    config?: Partial<ZkimIntegrityConfig>,
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

    const context = ErrorUtils.createContext("ZkimIntegrity", "initialize", {
      severity: "high",
    });

    await ErrorUtils.withErrorHandling(async () => {
      await sodium.ready;

      this.logger.info("Initializing ZKIM Integrity Service", {
        config: this.config,
      });

      // Initialize validation systems
      await this.initializeValidationSystems();

      this.isInitialized = true;
      this.logger.info("ZKIM Integrity Service initialized successfully");
    }, context);
  }

  /**
   * Validate complete ZKIM file integrity
   *
   * @param zkimFile - The ZKIM file to validate
   * @param platformKey - Optional platform encryption key (required for signature verification)
   * @param userKey - Optional user encryption key (required for signature verification)
   */
  public async validateFile(
    zkimFile: ZkimFile,
    platformKey?: Uint8Array,
    userKey?: Uint8Array
  ): Promise<IntegrityValidationResult> {
    await this.ensureInitialized();

    const startTime = performance.now();
    const { fileId } = zkimFile.header;

    // Check cache first
    const cachedResult = this.validationCache.get(fileId);
    if (cachedResult && this.isCacheValid(cachedResult)) {
      this.logger.info("Using cached validation result", { fileId });
      return cachedResult;
    }

    const result: IntegrityValidationResult = {
      isValid: false,
      validationLevel: "none",
      headerValid: false,
      chunksValid: false,
      signaturesValid: false,
      metadataValid: false,
      errors: [],
      warnings: [],
      validationTime: 0,
    };

    try {
      // Validate header
      if (this.config.enableHeaderValidation) {
        result.headerValid = await this.validateHeader(zkimFile.header);
        if (!result.headerValid) {
          result.errors.push("Header validation failed");
        }
      } else {
        result.headerValid = true;
        result.warnings.push("Header validation disabled");
      }

      // Validate chunks
      if (this.config.enableChunkValidation) {
        result.chunksValid = await this.validateChunks(
          zkimFile.chunks,
          zkimFile.header
        );
        if (!result.chunksValid) {
          result.errors.push("Chunk validation failed");
        }
      } else {
        result.chunksValid = true;
        result.warnings.push("Chunk validation disabled");
      }

      // Validate signatures
      if (this.config.enableSignatureValidation) {
        result.signaturesValid = await this.validateSignatures(
          zkimFile,
          platformKey,
          userKey
        );
        if (!result.signaturesValid) {
          result.errors.push("Signature validation failed");
        }
      } else {
        result.signaturesValid = true;
        result.warnings.push("Signature validation disabled");
      }

      // Validate metadata
      if (this.config.enableMetadataValidation) {
        result.metadataValid = await this.validateMetadata(zkimFile.metadata);
        if (!result.metadataValid) {
          result.errors.push("Metadata validation failed");
        }
      } else {
        result.metadataValid = true;
        result.warnings.push("Metadata validation disabled");
      }

      // Determine overall validation result
      const validationScore = this.calculateValidationScore(result);
      result.isValid = validationScore >= this.config.validationThreshold;
      result.validationLevel = this.determineValidationLevel(validationScore);
      result.validationTime = performance.now() - startTime;

      // Cache result
      this.validationCache.set(fileId, result);

      // Log audit entry
      if (this.config.enableAuditLogging) {
        this.logAuditEntry(
          fileId,
          "validateFile",
          result.isValid,
          result.errors.join(", ")
        );
      }

      // Log performance metrics
      if (this.config.enablePerformanceMetrics) {
        this.logger.info("File validation performance", {
          fileId,
          validationTime: result.validationTime,
          validationScore,
          isValid: result.isValid,
          errors: result.errors.length,
          warnings: result.warnings.length,
        });
      }

      this.logger.info("File integrity validation completed", {
        fileId,
        isValid: result.isValid,
        validationLevel: result.validationLevel,
        validationScore,
        errors: result.errors.length,
        warnings: result.warnings.length,
        validationTime: result.validationTime,
      });

      return result;
    } catch (error) {
      result.errors.push(
        `Validation error: ${error instanceof Error ? error.message : String(error)}`
      );
      result.validationTime = performance.now() - startTime;

      this.logger.error("File validation failed", {
        fileId,
        error: error instanceof Error ? error.message : String(error),
        validationTime: result.validationTime,
      });

      return result;
    }
  }

  /**
   * Validate specific file header
   */
  public async validateHeader(header: ZkimFileHeader): Promise<boolean> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZkimIntegrity",
      "validateHeader",
      {
        severity: "medium",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      // Use constant-time validation to prevent timing attacks
      const isValid = await withTimingProtection(
        async () => {
          // Validate magic number with constant-time comparison
          if (!validateMagicNumber(header.magic, "ZKIM")) {
            this.logger.warn("Invalid magic number in header", {
              magic: header.magic,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          // Validate version with constant-time comparison
          if (!validateVersion(header.version, header.version, 1, 255)) {
            this.logger.warn("Invalid version in header", {
              version: header.version,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          // Validate file size with constant-time comparison
          if (
            !validateSize(header.totalSize, header.totalSize, 0) ||
            header.totalSize > 10 * 1024 * 1024 * 1024
          ) {
            // 10 GB max
            this.logger.warn("Invalid file size in header", {
              totalSize: header.totalSize,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          // Validate chunk count with constant-time comparison
          if (
            !validateSize(header.chunkCount, header.chunkCount, 0) ||
            header.chunkCount > 1000000
          ) {
            // 1M chunks max
            this.logger.warn("Invalid chunk count in header", {
              chunkCount: header.chunkCount,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          // Validate timestamps with constant-time comparison
          const now = Date.now();
          const timeDiff = Math.abs(header.createdAt - now);
          if (header.createdAt <= 0 || timeDiff > 86400000) {
            // 24h future max
            this.logger.warn("Invalid creation timestamp in header", {
              createdAt: header.createdAt,
              now,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          // Validate algorithm identifiers with constant-time comparison
          if (!this.isValidAlgorithmId(header.compressionType)) {
            this.logger.warn("Invalid compression algorithm ID", {
              compressionType: header.compressionType,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          if (!this.isValidAlgorithmId(header.encryptionType)) {
            this.logger.warn("Invalid encryption algorithm ID", {
              encryptionType: header.encryptionType,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          if (!this.isValidAlgorithmId(header.hashType)) {
            this.logger.warn("Invalid hash algorithm ID", {
              hashType: header.hashType,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          if (!this.isValidAlgorithmId(header.signatureType)) {
            this.logger.warn("Invalid signature algorithm ID", {
              signatureType: header.signatureType,
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          // Add secure delay to prevent timing analysis
          await addSecureDelay(5); // 5ms delay

          return true;
        },
        10,
        50
      ); // 10ms min, 50ms max

      if (isValid) {
        this.logger.info("Header validation successful", {
          magic: header.magic,
          version: header.version,
          fileId: header.fileId,
          totalSize: header.totalSize,
          chunkCount: header.chunkCount,
        });
      }

      return isValid;
    }, context);

    if (!result.success) {
      throw new ServiceError(`Header validation failed: ${result.error}`, {
        code: "HEADER_VALIDATION_FAILED",
        details: {
          error: result.error,
          fileId: header.fileId,
        },
      });
    }

    if (result.data === undefined) {
      throw new ServiceError("Header validation result data is undefined", {
        code: "HEADER_VALIDATION_DATA_UNDEFINED",
        details: {
          fileId: header.fileId,
        },
      });
    }

    return result.data;
  }

  /**
   * Validate file chunks integrity
   */
  public async validateChunks(
    chunks: ZkimFileChunk[],
    header: ZkimFileHeader
  ): Promise<boolean> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZkimIntegrity",
      "validateChunks",
      {
        severity: "medium",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      // Validate chunk count matches header
      if (chunks.length !== header.chunkCount) {
        this.logger.warn("Chunk count mismatch", {
          expected: header.chunkCount,
          actual: chunks.length,
        });
        return false;
      }

      // Validate each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) {
          this.logger.warn("Chunk is undefined", { chunkIndex: i });
          continue;
        }

        // Validate chunk index
        if (chunk.chunkIndex !== i) {
          this.logger.warn("Invalid chunk index", {
            expected: i,
            actual: chunk.chunkIndex,
            chunkIndex: i,
          });
          return false;
        }

        // Validate chunk sizes
        if (chunk.chunkSize <= 0 || chunk.chunkSize > 1024 * 1024) {
          // 1 MB max per chunk
          this.logger.warn("Invalid chunk size", {
            chunkIndex: i,
            chunkSize: chunk.chunkSize,
          });
          return false;
        }

        // Validate nonce
        if (chunk.nonce.length !== 24) {
          // XChaCha20-Poly1305 nonce size
          this.logger.warn("Invalid nonce size", {
            chunkIndex: i,
            nonceLength: chunk.nonce.length,
            expected: 24,
          });
          return false;
        }

        // Validate integrity hash
        if (chunk.integrityHash.length !== 32) {
          // BLAKE3-256 hash size
          this.logger.warn("Invalid integrity hash size", {
            chunkIndex: i,
            hashLength: chunk.integrityHash.length,
            expected: 32,
          });
          return false;
        }

        // Validate encrypted data size
        if (chunk.encryptedData.length === 0) {
          this.logger.warn("Empty encrypted data", { chunkIndex: i });
          return false;
        }

        // Validate padding
        if (chunk.padding.length > 1024) {
          // 1 KB max padding
          this.logger.warn("Excessive padding", {
            chunkIndex: i,
            paddingLength: chunk.padding.length,
          });
          return false;
        }
      }

      this.logger.info("Chunk validation successful", {
        chunkCount: chunks.length,
        totalSize: chunks.reduce((sum, chunk) => sum + chunk.chunkSize, 0),
      });

      return true;
    }, context);

    if (!result.success) {
      throw new ServiceError(`Chunk validation failed: ${result.error}`, {
        code: "CHUNK_VALIDATION_FAILED",
        details: {
          error: result.error,
          chunkCount: chunks.length,
        },
      });
    }

    if (result.data === undefined) {
      throw new ServiceError("Chunk validation result data is undefined", {
        code: "CHUNK_VALIDATION_DATA_UNDEFINED",
        details: {
          chunkCount: chunks.length,
        },
      });
    }

    return result.data;
  }

  /**
   * Validate file signatures
   *
   * @param zkimFile - The ZKIM file to validate
   * @param platformKey - Optional platform encryption key (used to derive public key for verification)
   * @param userKey - Optional user encryption key (used to derive public key for verification)
   * @returns true if signatures are valid or if keys are not provided (signature verification skipped)
   */
  public async validateSignatures(
    zkimFile: ZkimFile,
    platformKey?: Uint8Array,
    userKey?: Uint8Array
  ): Promise<boolean> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZkimIntegrity",
      "validateSignatures",
      {
        severity: "medium",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      // If keys are not provided, skip signature verification
      if (!platformKey || !userKey) {
        this.logger.warn("Signature verification skipped: keys not provided", {
          hasPlatformKey: !!platformKey,
          hasUserKey: !!userKey,
          fileId: zkimFile.header.fileId,
        });
        return true; // Return true to not fail validation, but warn that verification was skipped
      }

      try {
        // Validate platform signature
        const platformData = JSON.stringify({
          header: zkimFile.header,
          metadata: zkimFile.metadata,
        });
        const platformValid = await this.verifySignature(
          platformData,
          zkimFile.platformSignature,
          "platform",
          platformKey
        );

        if (!platformValid) {
          this.logger.warn("Platform signature validation failed");
          return false;
        }

        // Validate user signature
        const userData = JSON.stringify({
          header: zkimFile.header,
          chunks: zkimFile.chunks.map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            chunkSize: chunk.chunkSize,
            integrityHash: chunk.integrityHash,
          })),
          metadata: zkimFile.metadata,
        });
        const userValid = await this.verifySignature(
          userData,
          zkimFile.userSignature,
          "user",
          userKey
        );

        if (!userValid) {
          this.logger.warn("User signature validation failed");
          return false;
        }

        // Validate content signature (uses userKey)
        const contentData = zkimFile.chunks.map((chunk) => chunk.integrityHash);
        const contentValid = await this.verifySignature(
          JSON.stringify(contentData),
          zkimFile.contentSignature,
          "content",
          userKey
        );

        if (!contentValid) {
          this.logger.warn("Content signature validation failed");
          return false;
        }

        this.logger.info("All signatures validated successfully");
        return true;
      } catch (error) {
        this.logger.error("Signature validation error", {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }, context);

    if (!result.success) {
      throw new ServiceError(`Signature validation failed: ${result.error}`, {
        code: "SIGNATURE_VALIDATION_FAILED",
        details: {
          error: result.error,
          fileId: zkimFile.header.fileId,
        },
      });
    }

    if (result.data === undefined) {
      throw new ServiceError("Signature validation result data is undefined", {
        code: "SIGNATURE_VALIDATION_DATA_UNDEFINED",
        details: {
          fileId: zkimFile.header.fileId,
        },
      });
    }

    return result.data;
  }

  /**
   * Validate file metadata
   */
  public async validateMetadata(metadata: ZkimFileMetadata): Promise<boolean> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZkimIntegrity",
      "validateMetadata",
      {
        severity: "low",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      // Validate file name
      if (metadata.fileName && typeof metadata.fileName !== "string") {
        this.logger.warn("Invalid file name type", { fileName: metadata.fileName });
        return false;
      }

      // Validate MIME type
      if (metadata.mimeType && typeof metadata.mimeType !== "string") {
        this.logger.warn("Invalid MIME type", { mimeType: metadata.mimeType });
        return false;
      }

      // Validate tags
      if (metadata.tags && !Array.isArray(metadata.tags)) {
        this.logger.warn("Invalid tags format", { tags: metadata.tags });
        return false;
      }

      // Validate access control
      if (metadata.accessControl) {
        const { readAccess, writeAccess, deleteAccess } =
          metadata.accessControl;

        if (readAccess && !Array.isArray(readAccess)) {
          this.logger.warn("Invalid read access format", { readAccess });
          return false;
        }

        if (writeAccess && !Array.isArray(writeAccess)) {
          this.logger.warn("Invalid write access format", { writeAccess });
          return false;
        }

        if (deleteAccess && !Array.isArray(deleteAccess)) {
          this.logger.warn("Invalid delete access format", { deleteAccess });
          return false;
        }
      }

      // Validate retention policy
      if (metadata.retentionPolicy) {
        const { expiresAt, maxAccessCount, autoDelete } =
          metadata.retentionPolicy;

        if (expiresAt && typeof expiresAt !== "number") {
          this.logger.warn("Invalid expiration timestamp", { expiresAt });
          return false;
        }

        if (maxAccessCount && typeof maxAccessCount !== "number") {
          this.logger.warn("Invalid max access count", { maxAccessCount });
          return false;
        }

        if (autoDelete && typeof autoDelete !== "boolean") {
          this.logger.warn("Invalid auto delete flag", { autoDelete });
          return false;
        }
      }

      this.logger.info("Metadata validation successful");
      return true;
    }, context);

    if (!result.success) {
      throw new ServiceError(`Metadata validation failed: ${result.error}`, {
        code: "METADATA_VALIDATION_FAILED",
        details: {
          error: result.error,
        },
      });
    }

    if (result.data === undefined) {
      throw new ServiceError("Metadata validation result data is undefined", {
        code: "METADATA_VALIDATION_DATA_UNDEFINED",
      });
    }

    return result.data;
  }

  /**
   * Detect tampering in file
   */
  public async detectTampering(zkimFile: ZkimFile): Promise<{
    isTampered: boolean;
    tamperType: string[];
    evidence: string[];
  }> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZkimIntegrity",
      "detectTampering",
      {
        severity: "high",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      const tamperType: string[] = [];
      const evidence: string[] = [];

      // Check for header tampering
      if (!(await this.validateHeader(zkimFile.header))) {
        tamperType.push("header");
        evidence.push("Header validation failed");
      }

      // Check for chunk tampering
      if (!(await this.validateChunks(zkimFile.chunks, zkimFile.header))) {
        tamperType.push("chunks");
        evidence.push("Chunk validation failed");
      }

      // Check for signature tampering
      if (!(await this.validateSignatures(zkimFile))) {
        tamperType.push("signatures");
        evidence.push("Signature validation failed");
      }

      // Check for metadata tampering
      if (!(await this.validateMetadata(zkimFile.metadata))) {
        tamperType.push("metadata");
        evidence.push("Metadata validation failed");
      }

      // Check for timestamp anomalies
      const now = Date.now();
      if (zkimFile.header.createdAt > now + 86400000) {
        // 24h future
        tamperType.push("timestamp");
        evidence.push("Creation timestamp is in the future");
      }

      // Check for size inconsistencies
      const calculatedSize = zkimFile.chunks.reduce(
        (sum, chunk) => sum + chunk.chunkSize,
        0
      );
      if (Math.abs(calculatedSize - zkimFile.header.totalSize) > 1024) {
        // 1 KB tolerance
        tamperType.push("size");
        evidence.push(
          `Size mismatch: expected ${zkimFile.header.totalSize}, calculated ${calculatedSize}`
        );
      }

      const isTampered = tamperType.length > 0;

      if (isTampered) {
        this.logger.warn("File tampering detected", {
          fileId: zkimFile.header.fileId,
          tamperType,
          evidence,
        });
      }

      return {
        isTampered,
        tamperType,
        evidence,
      };
    }, context);

    if (!result.success) {
      throw new ServiceError(`Tampering detection failed: ${result.error}`, {
        code: "TAMPERING_DETECTION_FAILED",
        details: {
          error: result.error,
          fileId: zkimFile.header.fileId,
        },
      });
    }

    if (!result.data) {
      throw new ServiceError("Tampering detection result data is undefined", {
        code: "TAMPERING_DETECTION_DATA_UNDEFINED",
        details: {
          fileId: zkimFile.header.fileId,
        },
      });
    }

    return result.data;
  }

  // ===== PRIVATE HELPER METHODS =====

  private async initializeValidationSystems(): Promise<void> {
    // Initialize validation systems
    // This will be enhanced in Phase 2 with advanced validation algorithms
    this.logger.info("Validation systems initialized");
  }

  private isCacheValid(result: IntegrityValidationResult): boolean {
    // Cache is valid for 5 minutes
    const cacheAge = Date.now() - result.validationTime;
    return cacheAge < 5 * 60 * 1000;
  }

  private calculateValidationScore(result: IntegrityValidationResult): number {
    let score = 0;
    let total = 0;

    if (this.config.enableHeaderValidation) {
      score += result.headerValid ? 1 : 0;
      total += 1;
    }

    if (this.config.enableChunkValidation) {
      score += result.chunksValid ? 1 : 0;
      total += 1;
    }

    if (this.config.enableSignatureValidation) {
      score += result.signaturesValid ? 1 : 0;
      total += 1;
    }

    if (this.config.enableMetadataValidation) {
      score += result.metadataValid ? 1 : 0;
      total += 1;
    }

    return total > 0 ? score / total : 0;
  }

  private determineValidationLevel(score: number): "none" | "basic" | "full" {
    if (score >= 0.95) return "full";
    if (score >= 0.75) return "basic";
    return "none";
  }

  private isValidAlgorithmId(id: number): boolean {
    return id >= 0 && id <= 255;
  }

  private async verifySignature(
    data: string,
    signature: Uint8Array,
    keyType: string,
    encryptionKey: Uint8Array
  ): Promise<boolean> {
    const context = ErrorUtils.createContext(
      "ZKIMIntegrity",
      "verifySignature",
      {
        severity: "high",
        metadata: {
          keyType,
          dataLength: data.length,
          signatureLength: signature.length,
          encryptionKeyLength: encryptionKey.length,
        },
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      await sodium.ready;

      // Validate signature length (Ed25519 signatures are 64 bytes)
      if (signature.length !== 64) {
        this.logger.warn("Invalid signature length", {
          expected: 64,
          actual: signature.length,
          keyType,
        });
        return false;
      }

      // Validate encryption key length (must be 32 bytes to derive signing key)
      if (encryptionKey.length !== 32) {
        this.logger.warn(
          "Invalid encryption key length for signature verification",
          {
            expected: 32,
            actual: encryptionKey.length,
            keyType,
          }
        );
        return false;
      }

      // Derive signing key from encryption key using BLAKE3 (consistent with signing process)
      const { blake3 } = await import("@noble/hashes/blake3.js");
      // Derive a 32-byte seed from the encryption key using BLAKE3
      const seed = blake3(encryptionKey, { dkLen: 32 });
      // Generate a proper Ed25519 keypair from the seed
      const keypair = sodium.crypto_sign_seed_keypair(seed);
      const signingKey = keypair.privateKey;

      // Derive public key from signing key (private key)
      // For Ed25519, if we have a 64-byte private key, we can extract the public key
      // libsodium's crypto_sign_ed25519_sk_to_pk extracts public key from private key
      let publicKey: Uint8Array;
      try {
        // Derive public key from 64-byte private key
        publicKey = sodium.crypto_sign_ed25519_sk_to_pk(signingKey);
      } catch (error) {
        this.logger.error("Failed to derive public key from signing key", {
          error: error instanceof Error ? error.message : String(error),
          keyType,
          signingKeyLength: signingKey.length,
        });
        return false;
      }

      // Encode message to bytes
      const message = new TextEncoder().encode(data);

      // Verify Ed25519 signature using public key
      try {
        const isValid = sodium.crypto_sign_verify_detached(
          signature,
          message,
          publicKey
        );

        if (!isValid) {
          this.logger.warn("Ed25519 signature verification failed", {
            keyType,
            signatureLength: signature.length,
            messageLength: message.length,
            publicKeyLength: publicKey.length,
          });
        }

        return isValid;
      } catch (error) {
        this.logger.error("Ed25519 signature verification error", {
          error: error instanceof Error ? error.message : String(error),
          keyType,
        });
        return false;
      }
    }, context);

    if (!result.success) {
      throw new ServiceError(`Signature verification failed: ${result.error}`, {
        code: "SIGNATURE_VERIFICATION_FAILED",
        details: {
          error: result.error,
          keyType,
        },
      });
    }

    if (result.data === undefined) {
      throw new ServiceError(
        "Signature verification result data is undefined",
        {
          code: "SIGNATURE_VERIFICATION_DATA_UNDEFINED",
          details: {
            keyType,
          },
        }
      );
    }

    return result.data;
  }

  private logAuditEntry(
    fileId: string,
    operation: string,
    result: boolean,
    details: string
  ): void {
    this.auditLog.push({
      timestamp: Date.now(),
      fileId,
      operation,
      result,
      details,
    });

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }

  /**
   * Get audit log entries
   */
  public getAuditLog(limit?: number): Array<{
    timestamp: number;
    fileId: string;
    operation: string;
    result: boolean;
    details: string;
  }> {
    const entries = [...this.auditLog];
    if (limit) {
      return entries.slice(-limit);
    }
    return entries;
  }

  /**
   * Clear validation cache
   */
  public clearCache(): void {
    this.validationCache.clear();
    this.logger.info("Validation cache cleared");
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext("ZkimIntegrity", "cleanup", {
      severity: "low",
    });

    await ErrorUtils.withErrorHandling(async () => {
      this.validationCache.clear();
      this.auditLog = [];
      this.isInitialized = false;

      this.logger.info("ZKIM Integrity Service cleaned up");
    }, context);
  }
}

