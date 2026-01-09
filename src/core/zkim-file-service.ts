/**
 * ZKIM File Service - Core File Format Implementation
 * Handles ZKIM file creation, management, and operations
 *
 * Service Flow:
 * 1. Create ZKIM files with three-layer encryption (Platform/User/Content)
 * 2. Manage file lifecycle and metadata
 * 3. Provide searchable encryption capabilities
 * 4. Ensure integrity validation and tamper detection
 */

// libsodium-wrappers-sumo uses default export, not namespace export
import sodium from "libsodium-wrappers-sumo";

import { blake3 } from "@noble/hashes/blake3.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

import { fromBase64 } from "../utils/crypto";
import { ErrorUtils } from "../utils/error-handling";
import { ServiceBase } from "../utils/singleton-base";

import { ServiceError } from "../types/errors";

import { defaultLogger, type ILogger } from "../utils/logger";

import { SearchableEncryption } from "./searchable-encryption";
import type {
  IntegrityValidationResult,
  SearchQuery,
  SearchResult,
  ZkimFile,
  ZkimFileChunk,
  ZkimFileHeader,
  ZkimFileMetadata,
  ZkimFileResult,
  ZKIMFileServiceConfig,
} from "../types/zkim-file-format";
import { ZkimEncryption } from "./zkim-encryption";
import { ZkimIntegrity } from "./zkim-integrity";

import {
  FILE_PROCESSING_CONSTANTS,
  ZKIM_ENCRYPTION_CONSTANTS,
  ZKIM_FILE_SERVICE_CONSTANTS,
  ZKIM_POST_QUANTUM_CONSTANTS,
} from "../constants";
import { IStorageBackend } from "../types/storage";

// Wire format utilities (same-directory import allowed per cursorrules)
import {
  writeWireFormat,
  formatEhHeader,
  generateFileSignature,
  calculateMerkleRoot,
  calculateManifestHash,
  parseZkimFile,
} from "./zkim-file-wire-format";

export class ZKIMFileService extends ServiceBase {
  private readonly defaultConfig: ZKIMFileServiceConfig = {
    enableCompression: true,
    enableDeduplication: true,
    chunkSize: FILE_PROCESSING_CONSTANTS.DEFAULT_CHUNK_SIZE,
    compressionLevel: FILE_PROCESSING_CONSTANTS.COMPRESSION_LEVEL,
    compressionAlgorithm:
      FILE_PROCESSING_CONSTANTS.DEFAULT_COMPRESSION_ALGORITHM,
    enableSearchableEncryption: true,
    enableIntegrityValidation: true,
    enableMetadataIndexing: true,
    maxFileSize: FILE_PROCESSING_CONSTANTS.DEFAULT_MAX_FILE_SIZE,
    enableStreaming: true,
  };

  private config: ZKIMFileServiceConfig;
  private storageService: IStorageBackend | null = null;
  private logger: ILogger;

  public constructor(
    config?: Partial<ZKIMFileServiceConfig>,
    logger: ILogger = defaultLogger,
    storageService?: IStorageBackend
  ) {
    super();
    this.config = { ...this.defaultConfig, ...config };
    this.logger = logger;
    this.storageService = storageService ?? null;
  }

  public async initialize(): Promise<void> {
    if (this.isReady()) {
      return;
    }

    const context = ErrorUtils.createContext("ZkimFileService", "initialize", {
      severity: "high",
      timestamp: new Date().toISOString(),
    });

    await ErrorUtils.withErrorHandling(async () => {
      this.logger.info("Initializing ZKIM File Service", {
        config: this.config,
      });

      // Initialize all ZKIM services (getServiceInstance already initializes)
      const [encryption, integrity, searchable] = await Promise.all([
        ZkimEncryption.getServiceInstance(),
        ZkimIntegrity.getServiceInstance(),
        SearchableEncryption.getServiceInstance(),
      ]);

      // Explicitly mark initialized services to avoid unused warnings
      void encryption;
      void integrity;
      void searchable;

      // Ensure libsodium is fully initialized before use
      await sodium.ready;

      if (typeof sodium.randombytes_buf !== "function") {
        throw new ServiceError(
          "libsodium functions not available after ready",
          { code: "LIBSODIUM_FUNCTION_UNAVAILABLE" }
        );
      }
      this.logger.info("ZKIM File Service initialized successfully");
    }, context);
  }

  /**
   * Create a new ZKIM file with three-layer encryption
   * @param skipCasStorage - If true, skip storing to CAS (prevents circular dependency when persisting to filesystem)
   */
  public async createZkimFile(
    data: Uint8Array | string,
    userId: string,
    platformKey: Uint8Array,
    userKey: Uint8Array,
    metadata?: Partial<ZkimFileMetadata>,
    skipCasStorage = false
  ): Promise<ZkimFileResult> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZKIMFileService",
      "createZkimFile",
      {
        severity: "medium",
        userId,
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      const startTime = performance.now();

      const dataBuffer =
        typeof data === "string" ? new TextEncoder().encode(data) : data;

      if (dataBuffer.length > this.config.maxFileSize) {
        throw new ServiceError(
          `File size ${dataBuffer.length} exceeds maximum allowed size ${this.config.maxFileSize}`,
          {
            code: "FILE_SIZE_EXCEEDED",
            details: {
              fileSize: dataBuffer.length,
              maxSize: this.config.maxFileSize,
            },
          }
        );
      }

      const fileId = await this.generateFileId(dataBuffer, userId);
      const header = this.createFileHeader(fileId, userId, dataBuffer.length);
      const processedData = await this.processData(dataBuffer);
      const fileMetadata = this.createFileMetadata(metadata, userId);

      // Generate ML-KEM-768 key pair for post-quantum key derivation
      await sodium.ready;
      const { ml_kem768 } = await import("@noble/post-quantum/ml-kem.js");
      const { publicKey: kemPublicKey, secretKey: kemSecretKey } = ml_kem768.keygen();

      // Encapsulate shared secret using own public key (self-encryption for storage)
      // This enables post-quantum key derivation during decryption
      const { cipherText: kemCipherText, sharedSecret } = ml_kem768.encapsulate(kemPublicKey);

      // Derive platform and user keys from ML-KEM-768 shared secret
      // Platform key includes platformKey parameter for tenant isolation
      const platformKeySeed = new Uint8Array([...sharedSecret, ...platformKey]);
      const derivedPlatformKey = blake3(platformKeySeed, { dkLen: 32 });
      const userKeySeed = new Uint8Array([...sharedSecret, ...userKey]);
      const derivedUserKey = blake3(userKeySeed, { dkLen: 32 });
      
      // Securely clear shared secret from memory
      sharedSecret.fill(0);

      // Store ML-KEM-768 public key in metadata for reference
      fileMetadata.kemPublicKey = sodium.to_base64(kemPublicKey);

      // Store ML-KEM-768 secret key encrypted with user key for decryption
      // Skip if skipCasStorage is true (prevents storage dependency)
      if (!skipCasStorage) {
        await this.storeKemSecretKey(fileId, userId, kemSecretKey, userKey);
      }

      const encryptionService = await ZkimEncryption.getServiceInstance();
      const encryptionResult = await encryptionService.encryptData(
        processedData.compressedData,
        derivedPlatformKey,
        derivedUserKey,
        fileId,
        fileMetadata.customFields
      );

      const contentEncryptedData = encryptionResult.contentEncrypted;
      const [platformNonce, userNonce, contentNonce] = encryptionResult.nonces;

      fileMetadata.customFields = {
        ...fileMetadata.customFields,
        encryptionType: "3-layer-zkim",
        kemCipherText: sodium.to_base64(kemCipherText), // Store KEM ciphertext for wire format reconstruction
        platformEncrypted: sodium.to_base64(encryptionResult.platformEncrypted),
        userEncrypted: sodium.to_base64(encryptionResult.userEncrypted),
        platformNonce: platformNonce ? sodium.to_base64(platformNonce) : "",
        userNonce: userNonce ? sodium.to_base64(userNonce) : "",
        contentNonce: contentNonce ? sodium.to_base64(contentNonce) : "",
        // Content key is NOT stored in metadata for security
        // It must be retrieved by decrypting the user layer
      };

      const chunks = await this.mapEncryptedContentToChunks(
        contentEncryptedData,
        processedData,
        contentNonce ?? new Uint8Array(24),
        fileId,
        header.version
      );

      // Update header chunkCount to match actual number of chunks
      // Chunks are created from encrypted data, which may have different size than original
      header.chunkCount = chunks.length;

      const signatures = await this.generateSignatures(
        header,
        chunks,
        fileMetadata,
        platformKey,
        userKey
      );

      const zkimFile: ZkimFile = {
        header,
        chunks,
        metadata: fileMetadata,
        platformSignature: signatures.platform,
        userSignature: signatures.user,
        contentSignature: signatures.content,
      };

      const tagSize = ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;
      const platformCiphertext = encryptionResult.platformEncrypted.slice(
        0,
        encryptionResult.platformEncrypted.length - tagSize
      );
      const platformTag = encryptionResult.platformEncrypted.slice(-tagSize);
      const ehPlatform = formatEhHeader(platformNonce ?? new Uint8Array(24), {
        ciphertext: platformCiphertext,
        tag: platformTag,
      });

      const userCiphertext = encryptionResult.userEncrypted.slice(
        0,
        encryptionResult.userEncrypted.length - tagSize
      );
      const userTag = encryptionResult.userEncrypted.slice(-tagSize);
      const ehUser = formatEhHeader((userNonce ?? new Uint8Array(24)), {
        ciphertext: userCiphertext,
        tag: userTag,
      });

      const merkleRoot = calculateMerkleRoot(chunks);
      const manifestHash = calculateManifestHash(ehUser);

      const algSuiteId = ZKIM_ENCRYPTION_CONSTANTS.ALG_SUITE_ID;
      // generateFileSignature derives signing key from userKey internally
      // Uses context "zkim/ml-dsa-65/file" for deterministic key generation
      const fileSignature = await generateFileSignature(
        merkleRoot,
        manifestHash,
        algSuiteId,
        header.version,
        userKey
      );

      let objectId: string;
      if (skipCasStorage) {
        objectId = fileId;
        this.logger.debug("Skipping CAS storage to prevent circular dependency", {
          fileId,
          objectId,
        });
      } else {
        const wireFormatFile = writeWireFormat(
          header,
          kemCipherText,
          ehPlatform,
          ehUser,
          chunks,
          merkleRoot,
          fileSignature,
          this.logger
        );

        if (!this.storageService) {
          this.logger.warn("Storage service not available, skipping CAS storage");
          objectId = fileId;
        } else {
          await this.storageService.set(fileId, wireFormatFile);
          objectId = fileId;
        }

        this.logger.debug("ZKIM file stored in wire format", {
          fileId,
          objectId,
          wireFormatSize: wireFormatFile.length,
        });
      }

      if (this.config.enableSearchableEncryption) {
        const searchService = await SearchableEncryption.getServiceInstance();
        await searchService.indexFile(zkimFile, userId);
      }

      const processingTime = performance.now() - startTime;
      const compressionRatio = processedData.compressedSize / dataBuffer.length;
      const encryptionOverhead =
        zkimFile.chunks.reduce(
          (sum, chunk) => sum + chunk.encryptedData.length,
          0
        ) /
          dataBuffer.length -
        1;

      this.logger.info("ZKIM file created successfully", {
        fileId,
        objectId,
        size: dataBuffer.length,
        chunks: chunks.length,
        processingTime,
        compressionRatio,
        encryptionOverhead,
      });

      return {
        success: true,
        file: zkimFile,
        zkimFile,
        objectId: objectId ?? "unknown",
        size: dataBuffer.length,
        chunks: chunks.length,
        processingTime,
        compressionRatio,
        encryptionOverhead,
      };
    }, context);

    if (!result.success) {
      const error: string | ServiceError = result.error as
        | string
        | ServiceError;
      const errorMessage =
        error instanceof ServiceError
          ? error.message
          : typeof error === "string"
            ? error
            : String(error);
      const errorDetails =
        error instanceof ServiceError && "details" in error
          ? error.details
          : undefined;

      const logError =
        error instanceof ServiceError ? error : new Error(errorMessage);
      this.logger.error("ZKIM file creation failed", logError, {
        errorMessage,
        errorDetails,
      });

      throw new ServiceError(`ZKIM file creation failed: ${errorMessage}`, {
        code: "ZKIM_FILE_CREATION_FAILED",
        details: {
          error: result.error,
          errorMessage,
          errorDetails,
        },
      });
    }

    if (!result.data) {
      throw new ServiceError("ZKIM file creation result data is undefined", {
        code: "ZKIM_FILE_CREATION_DATA_MISSING",
      });
    }

    return {
      ...result.data,
      zkimFile: result.data.file,
      objectId: result.data.objectId ?? "unknown",
    };
  }

  /**
   * Decrypt and retrieve a ZKIM file
   */
  public async decryptZkimFile(
    zkimFile: ZkimFile,
    userId: string,
    userKey: Uint8Array
  ): Promise<Uint8Array> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZKIMFileService",
      "decryptZkimFile",
      {
        severity: "medium",
        userId,
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      if (this.config.enableIntegrityValidation) {
        const integrityService = await ZkimIntegrity.getServiceInstance();
        const integrityResult = await integrityService.validateFile(zkimFile);
        if (!integrityResult.isValid) {
          throw new ServiceError(
            `File integrity validation failed: ${integrityResult.errors.join(", ")}`,
            {
              code: "INTEGRITY_VALIDATION_FAILED",
              details: {
                errors: integrityResult.errors,
                fileId: zkimFile.header.fileId,
              },
            }
          );
        }
      }

      // Verify user access
      if (!this.verifyUserAccess(zkimFile, userId)) {
        throw new ServiceError("User does not have access to this file", {
          code: "ACCESS_DENIED",
          details: {
            userId,
            fileId: zkimFile.header.fileId,
          },
        });
      }

      const customFields = zkimFile.metadata.customFields ?? {};
      const isThreeLayer = customFields.encryptionType === "3-layer-zkim";

      let decryptedChunks: Uint8Array[];

      if (isThreeLayer) {
        const encryptionService = await ZkimEncryption.getServiceInstance();

        // Content key must be retrieved by decrypting the user layer
        // It is NOT stored in metadata for security reasons
        const userEncrypted = customFields.userEncrypted
          ? sodium.from_base64(customFields.userEncrypted as string)
          : null;
        const userNonce = customFields.userNonce
          ? sodium.from_base64(customFields.userNonce as string)
          : null;

        if (!userEncrypted || !userNonce) {
          throw new ServiceError(
            "Missing user layer encrypted data or nonce for 3-layer decryption",
            {
              code: "MISSING_DECRYPTION_DATA",
              details: {
                hasUserEncrypted: !!userEncrypted,
                hasUserNonce: !!userNonce,
              },
            }
          );
        }

        const { contentKey } = await encryptionService.decryptUserLayer(
          userEncrypted,
          userKey,
          userNonce
        );
        this.logger.debug("Decrypted user layer to get content key");

        const contentNonce = customFields.contentNonce
          ? sodium.from_base64(customFields.contentNonce as string)
          : null;

        if (!contentNonce) {
          throw new ServiceError(
            "Missing content nonce for 3-layer decryption",
            {
              code: "MISSING_CONTENT_NONCE",
            }
          );
        }

        // Debug constants for logging (declared once at function scope)
        const DEBUG_BYTES_COUNT_4 = 4; // Number of bytes to log for debugging (4 bytes)
        const DEBUG_BYTES_COUNT_8 = 8; // Number of bytes to log for debugging (8 bytes)

        this.logger.debug("Content decryption setup", {
          contentNonceLength: contentNonce.length,
          contentNonceFirstBytes: Array.from(
            contentNonce.slice(0, DEBUG_BYTES_COUNT_4)
          ),
          contentKeyLength: contentKey.length,
          contentKeyFirstBytes: Array.from(
            contentKey.slice(0, DEBUG_BYTES_COUNT_4)
          ),
          chunkCount: zkimFile.chunks.length,
          chunkNonces: zkimFile.chunks.map((c) => ({
            chunkIndex: c.chunkIndex,
            nonceLength: c.nonce.length,
            nonceFirstBytes: Array.from(c.nonce.slice(0, DEBUG_BYTES_COUNT_4)),
            nonceMatchesContentNonce:
              c.nonce.length === contentNonce.length &&
              c.nonce.every((byte, idx) => byte === contentNonce[idx]),
          })),
        });

        // Reconstruct encrypted content data from chunks
        // contentEncryptedData was encrypted as a whole, then chunked for storage
        // We need to reconstruct the full encrypted data (including tag) from chunks
        const chunkEncryptedDataArrays = zkimFile.chunks.map(
          (chunk) => chunk.encryptedData
        );
        const totalEncryptedLength = chunkEncryptedDataArrays.reduce(
          (sum, chunkData) => sum + chunkData.length,
          0
        );

        this.logger.debug("Reconstructing encrypted content", {
          chunkCount: zkimFile.chunks.length,
          totalEncryptedLength,
          chunkSizes: zkimFile.chunks.map((c) => c.encryptedData.length),
          chunkNonces: zkimFile.chunks.map((c) => ({
            chunkIndex: c.chunkIndex,
            nonceLength: c.nonce.length,
            nonceFirstBytes: Array.from(c.nonce.slice(0, DEBUG_BYTES_COUNT_4)),
          })),
        });

        const encryptedContentData = this.reconstructData(
          chunkEncryptedDataArrays,
          totalEncryptedLength
        );

        this.logger.debug("Reconstructed encrypted content verification", {
          reconstructedLength: encryptedContentData.length,
          expectedLength: totalEncryptedLength,
          match: encryptedContentData.length === totalEncryptedLength,
          firstChunkFirstBytes: chunkEncryptedDataArrays[0]
            ? Array.from(
                chunkEncryptedDataArrays[0].slice(0, DEBUG_BYTES_COUNT_8)
              )
            : [],
          lastChunkLastBytes: chunkEncryptedDataArrays[
            chunkEncryptedDataArrays.length - 1
          ]
            ? Array.from(
                (chunkEncryptedDataArrays[
                  chunkEncryptedDataArrays.length - 1
                ] ?? new Uint8Array(0)).slice(-DEBUG_BYTES_COUNT_8)
              )
            : [],
          reconstructedFirstBytes: Array.from(
            encryptedContentData.slice(0, DEBUG_BYTES_COUNT_8)
          ),
          reconstructedLastBytes: Array.from(
            encryptedContentData.slice(-DEBUG_BYTES_COUNT_8)
          ),
        });

        // Verify reconstructed data length matches expected
        const MIN_TAG_SIZE = ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE; // Minimum size for AEAD tag
        if (encryptedContentData.length < MIN_TAG_SIZE) {
          throw new ServiceError(
            `Reconstructed encrypted data too short: ${encryptedContentData.length} bytes (minimum ${MIN_TAG_SIZE} bytes for tag)`,
            {
              code: "INVALID_ENCRYPTED_DATA",
              details: {
                reconstructedLength: encryptedContentData.length,
                totalEncryptedLength,
                chunkCount: zkimFile.chunks.length,
                chunkSizes: zkimFile.chunks.map((c) => c.encryptedData.length),
              },
            }
          );
        }

        // Verify the reconstructed data matches what was originally encrypted
        // For debugging: check if the last bytes match the expected tag location
        const expectedCiphertextLength =
          encryptedContentData.length - ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE;
        this.logger.debug("Decrypting reconstructed content", {
          encryptedLength: encryptedContentData.length,
          expectedCiphertextLength,
          tagLength: ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE,
          contentKeyLength: contentKey.length,
          contentNonceLength: contentNonce.length,
          firstBytes: Array.from(
            encryptedContentData.slice(
              0,
              Math.min(DEBUG_BYTES_COUNT_8, encryptedContentData.length)
            )
          ),
          lastBytes: Array.from(
            encryptedContentData.slice(
              -Math.min(DEBUG_BYTES_COUNT_8, encryptedContentData.length)
            )
          ),
        });

        // Verify data integrity: ensure we have enough data for ciphertext + tag
        const MIN_ENCRYPTED_DATA_SIZE = ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE; // Minimum size for tag
        if (encryptedContentData.length < MIN_ENCRYPTED_DATA_SIZE) {
          throw new ServiceError(
            `Reconstructed encrypted data too short: ${encryptedContentData.length} bytes (minimum ${MIN_ENCRYPTED_DATA_SIZE} bytes for tag)`,
            {
              code: "INVALID_ENCRYPTED_DATA",
              details: {
                reconstructedLength: encryptedContentData.length,
                minRequired: MIN_ENCRYPTED_DATA_SIZE,
              },
            }
          );
        }

        const decryptedContent = await encryptionService.decrypt(
          encryptedContentData,
          contentKey,
          contentNonce
        );

        const { chunkSize } = this.config;
        decryptedChunks = [];
        for (let i = 0; i < decryptedContent.length; i += chunkSize) {
          decryptedChunks.push(decryptedContent.slice(i, i + chunkSize));
        }
      } else {
        // Fallback to old single-layer decryption (for backward compatibility)
        const encryptionService = await ZkimEncryption.getServiceInstance();
        decryptedChunks = await Promise.all(
          zkimFile.chunks.map((chunk) =>
            encryptionService.decryptChunk(
              chunk,
              userKey,
              zkimFile.header.fileId,
              chunk.chunkIndex
            )
          )
        );
      }

      // Decompress data
      this.logger.debug("Preparing to decompress data", {
        chunkCount: decryptedChunks.length,
        headerCompressionType: zkimFile.header.compressionType,
        totalSize: zkimFile.header.totalSize,
      });

      const decompressedData = await this.decompressData(
        decryptedChunks,
        zkimFile.header
      );

      const originalData = this.reconstructData(
        decompressedData,
        zkimFile.header.totalSize
      );

      this.logger.info("ZKIM file decrypted successfully", {
        fileId: zkimFile.header.fileId,
        userId,
        size: originalData.length,
      });

      return originalData;
    }, context);

    if (!result.success) {
      throw new ServiceError(`ZKIM file decryption failed: ${result.error}`, {
        code: "ZKIM_FILE_DECRYPTION_FAILED",
        details: { error: result.error },
      });
    }

    if (!result.data) {
      throw new ServiceError("ZKIM file decryption result data is undefined", {
        code: "ZKIM_FILE_DECRYPTION_DATA_MISSING",
      });
    }

    return result.data;
  }

  /**
   * Get a ZKIM file by object ID
   */
  public async getZkimFile(
    objectId: string
  ): Promise<{ success: boolean; data?: ZkimFile; error?: string }> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("ZKIMFileService", "getZkimFile", {
      severity: "medium",
      timestamp: new Date().toISOString(),
      metadata: { objectId },
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      try {
        if (!this.storageService) {
          return {
            success: false,
            error: "Storage service not available",
          };
        }

        // Retrieve content from storage
        const storedContent = await this.storageService.get(objectId);
        if (!storedContent || storedContent.length === 0) {
          return {
            success: false,
            error: "File not found or empty",
          };
        }

        // Parse the stored content as ZKIM file
        const encryptedContent = storedContent;

        // Extract metadata from parsed file (will be available after parsing)
        // For now, create a minimal metadata structure
        const fileMetadata: ZkimFileMetadata = {
          fileName: objectId,
          userId: "unknown",
          createdAt: Date.now(),
          mimeType: "application/octet-stream",
          customFields: {},
        };

        // Create ZkimFile object
        const zkimFile: ZkimFile = {
          header: {
            magic: ZKIM_FILE_SERVICE_CONSTANTS.DEFAULT_MAGIC,
            version: ZKIM_FILE_SERVICE_CONSTANTS.DEFAULT_VERSION,
            flags: 0,
            platformKeyId: "default",
            userId: fileMetadata.userId ?? "unknown",
            fileId: objectId,
            createdAt: fileMetadata.createdAt ?? Date.now(),
            chunkCount: 1,
            totalSize: encryptedContent.length,
            compressionType: 0,
            encryptionType: 1, // XChaCha20-Poly1305
            hashType: 1, // BLAKE3
            signatureType: 1, // ML-DSA-65 (FIPS 204)
          },
          chunks: [
            {
              chunkIndex: 0,
              chunkSize: encryptedContent.length,
              compressedSize: encryptedContent.length,
              encryptedSize: encryptedContent.length,
              nonce: new Uint8Array(24),
              encryptedData: encryptedContent,
              integrityHash: new Uint8Array(32),
              padding: new Uint8Array(0),
            },
          ],
          metadata: fileMetadata,
          platformSignature: new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.ML_DSA_65_SIGNATURE_SIZE),
          userSignature: new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.ML_DSA_65_SIGNATURE_SIZE),
          contentSignature: new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.ML_DSA_65_SIGNATURE_SIZE),
        };

        return {
          success: true,
          data: zkimFile,
        };
      } catch (error) {
        this.logger.error("Failed to get ZKIM file", error);
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to retrieve file",
        };
      }
    }, context);

    return result.data ?? { success: false, error: "Unknown error" };
  }

  /**
   * Search through encrypted files using searchable encryption
   */
  public async searchFiles(
    query: string,
    userId: string,
    limit?: number
  ): Promise<SearchResult> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext("ZKIMFileService", "searchFiles", {
      severity: "medium",
      userId,
    });

    const result = await ErrorUtils.withErrorHandling(async () => {
      if (!this.config.enableSearchableEncryption) {
        throw new ServiceError("Searchable encryption is not enabled", {
          code: "SEARCHABLE_ENCRYPTION_DISABLED",
        });
      }

      const searchQuery: SearchQuery = {
        queryId: await this.generateQueryId(),
        query,
        userId,
        timestamp: Date.now(),
        priority: "medium",
      };

      const searchService = await SearchableEncryption.getServiceInstance();
      const searchResult = await searchService.search(searchQuery, limit);

      this.logger.info("File search completed", {
        queryId: searchQuery.queryId,
        userId,
        query,
        resultCount: searchResult.totalResults,
        processingTime: searchResult.processingTime,
      });

      return searchResult;
    }, context);

    if (!result.success) {
      throw new ServiceError(`File search failed: ${result.error}`, {
        code: "FILE_SEARCH_FAILED",
        details: { error: result.error },
      });
    }

    if (!result.data) {
      throw new ServiceError("File search result data is undefined", {
        code: "FILE_SEARCH_DATA_MISSING",
      });
    }

    return result.data;
  }

  /**
   * Validate file integrity
   */
  public async validateFileIntegrity(
    zkimFile: ZkimFile
  ): Promise<IntegrityValidationResult> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZKIMFileService",
      "validateFileIntegrity",
      {
        severity: "medium",
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      if (!this.config.enableIntegrityValidation) {
        return {
          isValid: true,
          validationLevel: "none",
          headerValid: true,
          chunksValid: true,
          signaturesValid: true,
          metadataValid: true,
          errors: [],
          warnings: ["Integrity validation is disabled"],
          validationTime: 0,
        };
      }

      const integrityService = await ZkimIntegrity.getServiceInstance();
      const validationResult = await integrityService.validateFile(zkimFile);

      this.logger.info("File integrity validation completed", {
        fileId: zkimFile.header.fileId,
        isValid: validationResult.isValid,
        validationLevel: validationResult.validationLevel,
        errors: validationResult.errors.length,
        warnings: validationResult.warnings.length,
        validationTime: validationResult.validationTime,
      });

      return validationResult;
    }, context);

    if (!result.success) {
      throw new ServiceError(
        `File integrity validation failed: ${result.error}`,
        {
          code: "INTEGRITY_VALIDATION_FAILED",
          details: { error: result.error },
        }
      );
    }

    if (!result.data) {
      throw new ServiceError(
        "File integrity validation result data is undefined",
        {
          code: "INTEGRITY_VALIDATION_DATA_MISSING",
        }
      );
    }

    return result.data as IntegrityValidationResult;
  }

  /**
   * Update file metadata
   */
  public async updateFileMetadata(
    zkimFile: ZkimFile,
    userId: string,
    updates: Partial<ZkimFileMetadata>
  ): Promise<ZkimFile> {
    await this.ensureInitialized();

    const context = ErrorUtils.createContext(
      "ZKIMFileService",
      "updateFileMetadata",
      {
        severity: "medium",
        userId,
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      // Verify user has write access
      if (!this.verifyUserAccess(zkimFile, userId, "write")) {
        throw new ServiceError("User does not have write access to this file", {
          code: "WRITE_ACCESS_DENIED",
          details: { userId, fileId: zkimFile.header.fileId },
        });
      }

      // Update metadata
      const updatedMetadata = { ...zkimFile.metadata, ...updates };

      // Create new file with updated metadata
      const updatedFile: ZkimFile = {
        ...zkimFile,
        metadata: updatedMetadata,
      };

      // Re-sign with updated metadata
      const signatures = await this.generateSignatures(
        updatedFile.header,
        updatedFile.chunks,
        updatedFile.metadata,
        new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE), // Platform key placeholder
        new Uint8Array(ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE) // User key placeholder
      );

      updatedFile.userSignature = signatures.user;
      updatedFile.contentSignature = signatures.content;

      // Update in CAS - serialize ZkimFile to Uint8Array
      const serializedFile = new TextEncoder().encode(
        JSON.stringify(updatedFile)
      );
      if (this.storageService) {
        await this.storageService.set(zkimFile.header.fileId, serializedFile);
      } else {
        this.logger.warn("Storage service not available, skipping file update");
      }

      // Update search index if enabled
      if (this.config.enableSearchableEncryption) {
        const searchService = await SearchableEncryption.getServiceInstance();
        await searchService.updateFileIndex(updatedFile, userId);
      }

      this.logger.info("File metadata updated successfully", {
        fileId: zkimFile.header.fileId,
        userId,
        updates: Object.keys(updates),
      });

      return updatedFile;
    }, context);

    if (!result.success) {
      throw new ServiceError(`File metadata update failed: ${result.error}`, {
        code: "FILE_METADATA_UPDATE_FAILED",
        details: { error: result.error },
      });
    }

    if (!result.data) {
      throw new ServiceError("File metadata update result data is undefined", {
        code: "FILE_METADATA_UPDATE_DATA_MISSING",
      });
    }

    return result.data;
  }

  // Private helper methods

  /**
   * Derive ML-DSA-65 signing key from encryption key
   * Uses deterministic key generation with BLAKE3 seed derivation
   * ML-DSA-65 secret key is 4,032 bytes (FIPS 204)
   * 
   * Matches infrastructure implementation for consistency
   */
  private deriveMLDSA65SigningKeyFromEncryptionKey(
    encryptionKey: Uint8Array
  ): Uint8Array {
    // Derive a 32-byte seed from the encryption key using BLAKE3 with context
    const seedContext = new TextEncoder().encode("zkim/ml-dsa-65/signing");
    const combinedSeed = new Uint8Array(encryptionKey.length + seedContext.length);
    combinedSeed.set(encryptionKey);
    combinedSeed.set(seedContext, encryptionKey.length);
    const seed = blake3(combinedSeed, { dkLen: 32 });
    
    // Generate ML-DSA-65 keypair from the seed (deterministic)
    const keypair = ml_dsa65.keygen(seed);
    
    // Return a proper copy of the 4,032-byte secret key (ensure it's a contiguous Uint8Array)
    return new Uint8Array(keypair.secretKey);
  }

  /**
   * Decode base64 signing key with error handling
   */
  private async decodeBase64SigningKey(
    base64Key: string,
    keyType: "platform" | "user"
  ): Promise<Uint8Array> {
    try {
      // Use SSOT crypto-fallback to ensure consistent base64 handling across environments
      // (Buffer in Node, libsodium in browser/Electron)
      return await fromBase64(base64Key);
    } catch (error) {
      throw new ServiceError(
        `Failed to decode ${keyType} signing key from base64: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: "BASE64_DECODE_FAILED",
          details: {
            keyType,
            base64Length: base64Key.length,
            base64Prefix: base64Key.substring(0, 20), // eslint-disable-line no-magic-numbers -- First 20 chars for debugging
            error: error instanceof Error ? error.message : String(error),
          },
        }
      );
    }
  }

  /**
   * Validate ML-DSA-65 signing key length
   * ML-DSA-65 secret key must be exactly 4,032 bytes (FIPS 204)
   */
  private validateMLDSA65KeyLength(
    key: Uint8Array,
    keyType: "platform" | "user",
    base64Length?: number
  ): void {
    if (key.length !== ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY) {
      throw new ServiceError(
        `Invalid ${keyType} signing key length: expected ${ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY} bytes (ML-DSA-65), got ${key.length}`,
        {
          code: "INVALID_SIGNING_KEY_LENGTH",
          details: {
            keyType,
            expectedLength: ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY,
            actualLength: key.length,
            base64Length,
          },
        }
      );
    }
  }

  /**
   * Get or derive ML-DSA-65 signing key from metadata or encryption key
   * ML-DSA-65 secret key must be 4,032 bytes (FIPS 204)
   * If not provided in metadata, generates a key pair (non-deterministic)
   * For production use, signing keys should be provided in metadata
   */
  private async getOrDeriveSigningKey(
    customFields: Record<string, unknown> | undefined,
    signKeyField: "platformSignKey" | "userSignKey",
    encryptionKey: Uint8Array,
    keyType: "platform" | "user"
  ): Promise<Uint8Array> {
    const base64Key = customFields?.[signKeyField];

    if (base64Key && typeof base64Key === "string") {
      // Decode from base64
      const decodedKey = await this.decodeBase64SigningKey(base64Key, keyType);

      this.logger.debug(`${keyType} sign key decoded from base64`, {
        base64Length: base64Key.length,
        decodedLength: decodedKey.length,
        expectedLength: ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY,
      });

      // Validate length - must be exactly 4,032 bytes for ML-DSA-65
      this.validateMLDSA65KeyLength(decodedKey, keyType, base64Key.length);

      return decodedKey;
    } else {
      // Fallback: generate ML-DSA-65 key pair from encryption key seed
      // Note: This generates a new key pair each time (non-deterministic)
      // For production use, provide signing keys in metadata
      this.logger.warn(
        `No ${keyType} signing key provided in metadata. Generating ML-DSA-65 key pair (non-deterministic). For production, provide signing keys in metadata.`
      );
      return this.deriveMLDSA65SigningKeyFromEncryptionKey(encryptionKey);
    }
  }

  private async generateFileId(
    data: Uint8Array,
    userId: string
  ): Promise<string> {
    // Use BLAKE3 (ZKIM standard hash algorithm) instead of BLAKE2b
    // BLAKE3 supports variable output lengths and is faster
    // Matches infrastructure implementation for consistency
    const hash = blake3(data, { dkLen: ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE });
    
    // Hash userId with standard 32-byte output (not 1952 bytes - that's ML-DSA-65 public key size, not a hash size)
    const userIdBytes =
      typeof userId === "string"
        ? new TextEncoder().encode(userId)
        : userId;
    const userIdHash = blake3(userIdBytes, { dkLen: 32 });
    
    const combined = new Uint8Array(hash.length + userIdHash.length);
    combined.set(hash, 0);
    combined.set(userIdHash, hash.length);
    
    await sodium.ready;
    return sodium.to_base64(combined);
  }

  private createFileHeader(
    fileId: string,
    userId: string,
    totalSize: number
  ): ZkimFileHeader {
    // Map compression algorithm to type number
    const compressionTypeMap: Record<string, number> =
      ZKIM_FILE_SERVICE_CONSTANTS.COMPRESSION_TYPE_MAP;

    const compressionType = this.config.enableCompression
      ? compressionTypeMap[this.config.compressionAlgorithm] || 0
      : 0; // 0 = no compression

    return {
      magic: ZKIM_FILE_SERVICE_CONSTANTS.DEFAULT_MAGIC, // "ZKIM"
      version: ZKIM_FILE_SERVICE_CONSTANTS.DEFAULT_VERSION, // 1
      flags: 0,
      platformKeyId: "platform-key-placeholder",
      userId,
      fileId,
      createdAt: Date.now(),
      chunkCount: Math.ceil(totalSize / this.config.chunkSize),
      totalSize,
      compressionType,
      encryptionType: 1, // XChaCha20-Poly1305
      hashType: 1, // BLAKE3
      signatureType: 1, // ML-DSA-65 (FIPS 204)
    };
  }

  private async processData(data: Uint8Array): Promise<{
    compressedData: Uint8Array;
    compressedSize: number;
    chunks: Uint8Array[];
  }> {
    // Compress data if enabled
    let compressedData: Uint8Array;
    let compressedSize: number;

    if (this.config.enableCompression) {
      try {
        const encryptionService = await ZkimEncryption.getServiceInstance();
        const compressionResult = await encryptionService.compressData(data, {
          algorithm: this.config.compressionAlgorithm,
          level: this.config.compressionLevel,
        });
        ({ compressedData, compressedSize } = compressionResult);
      } catch (error) {
        // If compression fails (e.g., pako not available in Node.js test environment),
        // fall back to no compression
        this.logger.warn("Compression failed, falling back to uncompressed", {
          error: error instanceof Error ? error.message : String(error),
        });
        compressedData = data;
        compressedSize = data.length;
      }
    } else {
      compressedData = data;
      compressedSize = data.length;
    }

    // Create chunks from compressed data
    const chunks: Uint8Array[] = [];
    const { chunkSize } = this.config;

    for (let i = 0; i < compressedData.length; i += chunkSize) {
      chunks.push(compressedData.slice(i, i + chunkSize));
    }

    return {
      compressedData,
      compressedSize,
      chunks,
    };
  }

  /**
   * Map 3-layer encrypted content to ZKIM chunks
   * This method chunks the contentEncrypted data (already encrypted by 3-layer encryption)
   */
  private async mapEncryptedContentToChunks(
    contentEncryptedData: Uint8Array,
    processedData: {
      compressedData: Uint8Array;
      compressedSize: number;
      chunks: Uint8Array[];
    },
    contentNonce: Uint8Array,
    fileId: string,
    version: number
  ): Promise<ZkimFileChunk[]> {
    // Use parameters to avoid unused variable warnings
    void contentNonce;
    void fileId;
    void version;
    
    const chunks: ZkimFileChunk[] = [];
    const { chunkSize } = this.config;

    // Chunk the encrypted content data
    // Note: contentEncryptedData is already encrypted as a whole with tag appended
    // We chunk it for storage, but need to preserve the full data for decryption
    let chunkIndex = 0;
    for (let i = 0; i < contentEncryptedData.length; i += chunkSize) {
      const chunkData = contentEncryptedData.slice(i, i + chunkSize);
      const originalChunkIndex = chunkIndex;
      chunkIndex++;
      const originalChunk =
        originalChunkIndex < processedData.chunks.length
          ? processedData.chunks[originalChunkIndex]
          : null;

      // Generate cryptographically random nonce for each chunk
      // Security: Each chunk gets a unique random nonce (not derived from content nonce)
      // Chunks are storage chunks of already-encrypted content, but we use random nonces for security best practices
      const chunkNonce = await this.generateChunkNonce();

      // Generate integrity hash from original chunk (before encryption)
      const integrityHash = originalChunk
        ? await this.generateIntegrityHash(originalChunk)
        : await this.generateIntegrityHash(chunkData);

      // Add padding for bucket sizes
      const padding = this.generatePadding(chunkData.length);

      chunks.push({
        chunkIndex: originalChunkIndex,
        chunkSize: originalChunk?.length ?? chunkData.length,
        compressedSize: originalChunk?.length ?? chunkData.length,
        encryptedSize: chunkData.length,
        nonce: chunkNonce,
        encryptedData: chunkData,
        integrityHash,
        padding,
      });
    }

    return chunks;
  }

  /**
   * Generate cryptographically random nonce for chunk storage
   *
   * Security Critical: Nonces MUST be random and unique for each chunk.
   * Deterministic nonce generation breaks XChaCha20-Poly1305 security guarantees.
   *
   * Note: Chunks are storage chunks of already-encrypted content data.
   * These nonces are stored in wire format for metadata purposes.
   * Even though chunks are not re-encrypted, we use random nonces for security best practices.
   */
  private async generateChunkNonce(): Promise<Uint8Array> {
    await sodium.ready;
    // CRITICAL: Generate cryptographically random nonce using libsodium
    // Each nonce must be unique and random - never deterministic
    // XChaCha20-Poly1305 requires 24-byte nonces (sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
    return sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
  }

  private async generateIntegrityHash(data: Uint8Array): Promise<Uint8Array> {
    // Use BLAKE3 (ZKIM standard hash algorithm) instead of BLAKE2b
    return blake3(data, { dkLen: ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE });
  }


  private generatePadding(dataLength: number): Uint8Array {
    // Generate padding to reach next bucket size
    const bucketSizes = [32, 64, 128, 256, 512, 1024];
    const targetSize = bucketSizes.find((size) => size >= dataLength) ?? 1024;
    const paddingLength = targetSize - dataLength;

    if (paddingLength <= 0) return new Uint8Array(0);

    const padding = sodium.randombytes_buf(paddingLength);
    return padding;
  }

  private createFileMetadata(
    metadata: Partial<ZkimFileMetadata> | undefined,
    userId: string
  ): ZkimFileMetadata {
    return {
      fileName: metadata?.fileName ?? "unnamed",
      mimeType: metadata?.mimeType ?? "application/octet-stream",
      tags: metadata?.tags ?? [],
      customFields: metadata?.customFields ?? {},
      createdAt: metadata?.createdAt ?? Date.now(),
      accessControl: {
        readAccess: [userId],
        writeAccess: [userId],
        deleteAccess: [userId],
        ...metadata?.accessControl,
      },
      ...(metadata?.retentionPolicy && {
        retentionPolicy: metadata.retentionPolicy,
      }),
    };
  }

  private async generateSignatures(
    header: ZkimFileHeader,
    chunks: ZkimFileChunk[],
    metadata: ZkimFileMetadata,
    platformKey: Uint8Array,
    userKey: Uint8Array
  ): Promise<{
    platform: Uint8Array;
    user: Uint8Array;
    content: Uint8Array;
  }> {
    await sodium.ready;

    const { customFields } = metadata;
    this.logger.info("generateSignatures started", {
      hasCustomFields: !!customFields,
      hasPlatformSignKey: !!customFields?.platformSignKey,
      hasUserSignKey: !!customFields?.userSignKey,
      platformSignKeyType: typeof customFields?.platformSignKey,
      userSignKeyType: typeof customFields?.userSignKey,
      customFieldsKeys: customFields ? Object.keys(customFields) : [],
    });

    // Get or derive signing keys using consolidated helper methods
    const platformSignKey = await this.getOrDeriveSigningKey(
      customFields,
      "platformSignKey",
      platformKey,
      "platform"
    );

    const userSignKey = await this.getOrDeriveSigningKey(
      customFields,
      "userSignKey",
      userKey,
      "user"
    );

    // Generate platform signature (search-only, never decrypts)
    const platformData = JSON.stringify({ header, metadata });
    const platformSignature = await this.signData(
      platformData,
      platformSignKey
    );

    // Generate user signature (full decryption authority)
    // Use mapped chunk data to match validation in zkim-integrity.ts
    const userData = JSON.stringify({
      header,
      chunks: chunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        chunkSize: chunk.chunkSize,
        integrityHash: chunk.integrityHash,
      })),
      metadata,
    });
    const userSignature = await this.signData(userData, userSignKey);

    // Generate content signature (per-file integrity)
    const contentData = chunks.map((chunk) => chunk.integrityHash);
    const contentSignature = await this.signData(
      JSON.stringify(contentData),
      userSignKey
    );

    return {
      platform: platformSignature,
      user: userSignature,
      content: contentSignature,
    };
  }

  private async signData(data: string, key: Uint8Array): Promise<Uint8Array> {
    await sodium.ready;
    const message = new TextEncoder().encode(data);

    // Validate key length - must be ML-DSA-65 secret key (4,032 bytes)
    if (key.length !== ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY) {
      throw new ServiceError(
        `Invalid signing key length: expected ${ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY} bytes (ML-DSA-65), got ${key.length}`,
        {
          code: "INVALID_SIGNING_KEY_LENGTH",
          details: {
            expectedLength: ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SECRET_KEY,
            actualLength: key.length,
          },
        }
      );
    }

    try {
      // ML-DSA-65 signature (FIPS 204)
      // Correct parameter order: sign(secretKey, message)
      const signature = ml_dsa65.sign(key, message);
      this.logger.info("ZKIM ML-DSA-65 signData succeeded", {
        signatureLength: signature.length,
        expectedLength: ZKIM_POST_QUANTUM_CONSTANTS.ML_DSA_65_SIGNATURE,
      });
      return signature;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        "ZKIM signData failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          keyLength: key.length,
          errorMessage,
        }
      );
      throw new ServiceError(
        `ZKIM signData failed: ${errorMessage}`,
        {
          code: "ZKIM_SIGN_FAILED",
          details: {
            keyLength: key.length,
            errorMessage,
          },
        }
      );
    }
  }

  private verifyUserAccess(
    zkimFile: ZkimFile,
    userId: string,
    accessType: "read" | "write" | "delete" = "read"
  ): boolean {
    const { accessControl } = zkimFile.metadata;
    if (!accessControl) return false;

    switch (accessType) {
      case "read":
        return accessControl.readAccess.includes(userId);
      case "write":
        return accessControl.writeAccess.includes(userId);
      case "delete":
        return accessControl.deleteAccess.includes(userId);
      default:
        return false;
    }
  }

  private async decompressData(
    chunks: Uint8Array[],
    header: ZkimFileHeader
  ): Promise<Uint8Array[]> {
    // If no compression was used, return chunks as-is
    if (header.compressionType === 0) {
      return chunks;
    }

    // Map compression type number to algorithm name
    const compressionTypeMap: Record<number, string> =
      ZKIM_FILE_SERVICE_CONSTANTS.COMPRESSION_TYPE_REVERSE_MAP;

    const compressionAlgorithm = compressionTypeMap[header.compressionType];
    if (!compressionAlgorithm) {
      throw new ServiceError(
        `Unsupported compression type: ${header.compressionType}`,
        {
          code: "UNSUPPORTED_COMPRESSION_TYPE",
          details: { compressionType: header.compressionType },
        }
      );
    }

    // Reconstruct compressed data from chunks
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const compressedData = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
      compressedData.set(chunk, offset);
      offset += chunk.length;
    }

    // Decompress the data
    const encryptionService = await ZkimEncryption.getServiceInstance();
    const decompressedData = await encryptionService.decompressData(
      compressedData,
      header.totalSize,
      {
        algorithm: compressionAlgorithm as "brotli" | "gzip",
        level: this.config.compressionLevel,
      }
    );

    // Return decompressed data as a single chunk
    return [decompressedData];
  }

  private reconstructData(chunks: Uint8Array[], totalSize: number): Uint8Array {
    const reconstructed = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
      reconstructed.set(chunk, offset);
      offset += chunk.length;
    }

    return reconstructed;
  }

  private async generateQueryId(): Promise<string> {
    await sodium.ready;
    const BYTES_16 = 16; // Query ID size
    const randomBytes = sodium.randombytes_buf(BYTES_16);
    return sodium.to_base64(randomBytes);
  }

  /**
   * Store ML-KEM-768 secret key encrypted with user key
   */
  private async storeKemSecretKey(
    fileId: string,
    userId: string,
    kemSecretKey: Uint8Array,
    userKey: Uint8Array
  ): Promise<void> {
    if (!this.storageService) {
      this.logger.warn("Storage service not available, cannot store ML-KEM-768 secret key", {
        fileId,
        userId,
      });
      return;
    }

    await sodium.ready;
    
    // Encrypt ML-KEM-768 secret key with user key using XChaCha20-Poly1305
    const nonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
    const encrypted = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      kemSecretKey,
      null,
      null,
      nonce,
      userKey
    );
    
    // Store encrypted secret key in storage backend
    // Format: nonce (24 bytes) + encrypted data
    const encryptedData = new Uint8Array([...nonce, ...encrypted]);
    
    // Key format: "zkim-kem-key:{fileId}:{userId}"
    const storageKey = `zkim-kem-key:${fileId}:${userId}`;
    await this.storageService.set(storageKey, encryptedData);
    
    this.logger.debug("ML-KEM-768 secret key stored", {
      fileId,
      userId,
      keyLength: kemSecretKey.length,
    });
  }

  /**
   * Retrieve and decrypt ML-KEM-768 secret key
   */
  private async getKemSecretKey(
    fileId: string,
    userId: string,
    userKey: Uint8Array
  ): Promise<Uint8Array | null> {
    if (!this.storageService) {
      this.logger.debug("Storage service not available, cannot retrieve ML-KEM-768 secret key", {
        fileId,
        userId,
      });
      return null;
    }

    try {
      const storageKey = `zkim-kem-key:${fileId}:${userId}`;
      const encryptedData = await this.storageService.get(storageKey);
      
      if (!encryptedData || encryptedData.length === 0) {
        this.logger.debug("ML-KEM-768 secret key not found in storage", {
          fileId,
          userId,
        });
        return null;
      }
      
      // Extract nonce and encrypted data
      const nonceLength = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
      if (encryptedData.length < nonceLength) {
        throw new ServiceError("Invalid encrypted key format", {
          code: "INVALID_ENCRYPTED_KEY_FORMAT",
          details: {
            fileId,
            userId,
            contentLength: encryptedData.length,
          },
        });
      }
      
      const nonce = encryptedData.slice(0, nonceLength);
      const encrypted = encryptedData.slice(nonceLength);
      
      // Decrypt ML-KEM-768 secret key
      await sodium.ready;
      const kemSecretKey = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        encrypted,
        null,
        nonce,
        userKey
      );
      
      this.logger.debug("ML-KEM-768 secret key retrieved and decrypted", {
        fileId,
        userId,
        keyLength: kemSecretKey.length,
      });
      
      return kemSecretKey;
    } catch (error) {
      this.logger.warn("Failed to retrieve ML-KEM-768 secret key", {
        fileId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Cleanup method required by ServiceBase
   */
  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext("ZKIMFileService", "cleanup", {
      severity: "medium",
    });

    await ErrorUtils.withErrorHandling(async () => {
      this.logger.info("Cleaning up ZKIM File Service");

      // Cleanup services that were initialized by this service
      // Note: SingletonBase.clearInstances() will cleanup ALL services, but we also cleanup
      // services we directly initialized to ensure proper cleanup order
      try {
        const [encryption, integrity, searchable] = await Promise.allSettled([
          ZkimEncryption.getServiceInstance(),
          ZkimIntegrity.getServiceInstance(),
          SearchableEncryption.getServiceInstance(),
        ]);

        // Cleanup each service if it was successfully retrieved
        const cleanupPromises: Promise<void>[] = [];
        
        if (encryption.status === "fulfilled") {
          cleanupPromises.push(encryption.value.cleanup().catch((error) => {
            this.logger.warn("Failed to cleanup ZkimEncryption", { error });
          }));
        }
        
        if (integrity.status === "fulfilled") {
          cleanupPromises.push(integrity.value.cleanup().catch((error) => {
            this.logger.warn("Failed to cleanup ZkimIntegrity", { error });
          }));
        }
        
        if (searchable.status === "fulfilled") {
          cleanupPromises.push(searchable.value.cleanup().catch((error) => {
            this.logger.warn("Failed to cleanup SearchableEncryption", { error });
          }));
        }

        // Wait for all cleanups to complete - use allSettled to ensure all run
        await Promise.allSettled(cleanupPromises);
      } catch (error) {
        this.logger.warn("Error during service cleanup", { error });
      }
      
      // CRITICAL: Reset initialized state to allow re-initialization
      this.initialized = false;

      this.logger.info("ZKIM File Service cleanup completed");
    }, context);
  }

  /**
   * Download a ZKIM file by object ID
   * 
   * ⚠️ SECURITY: Requires explicit userKey and platformKey parameters.
   * Keys must be derived from actual user authentication, not generated deterministically.
   * See Authentication Integration guide for proper key derivation.
   */
  public async downloadFile(
    objectId: string,
    userId: string,
    platformKey: Uint8Array,
    userKey: Uint8Array
  ): Promise<{
    success: boolean;
    data?: Uint8Array;
    error?: string;
  }> {
    const context = ErrorUtils.createContext(
      "ZKIMFileService",
      "downloadFile",
      {
        severity: "medium",
        metadata: { objectId, userId },
      }
    );

    const result = await ErrorUtils.withErrorHandling(async () => {
      await sodium.ready;

      // Validate keys
      if (platformKey.length !== ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE) {
        throw new ServiceError(
          "Platform key must be 32 bytes",
          {
            code: "INVALID_PLATFORM_KEY",
            details: { keyLength: platformKey.length },
          }
        );
      }

      if (userKey.length !== ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE) {
        throw new ServiceError(
          "User key must be 32 bytes",
          {
            code: "INVALID_USER_KEY",
            details: { keyLength: userKey.length },
          }
        );
      }

      // Retrieve the ZKIM file from storage
      if (!this.storageService) {
        throw new ServiceError(
          "Storage service not available",
          {
            code: "STORAGE_NOT_AVAILABLE",
            details: { objectId },
          }
        );
      }

      const storedContent = await this.storageService.get(objectId);
      if (!storedContent || storedContent.length === 0) {
        throw new ServiceError(
          "Failed to retrieve file: Content not found or empty",
          {
            code: "FILE_NOT_FOUND",
            details: { objectId },
          }
        );
      }

      // Try to retrieve ML-KEM-768 secret key for post-quantum decryption
      // Use objectId as fileId (they should match)
      const fileId = objectId;
      const kemSecretKey = await this.getKemSecretKey(fileId, userId, userKey);

      // Parse the ZKIM file (detects format automatically)
      // Pass kemSecretKey if available for post-quantum decryption
      const encryptionService = await ZkimEncryption.getServiceInstance();
      const zkimFile = await parseZkimFile(
        storedContent,
        userKey,
        platformKey,
        encryptionService,
        this.logger,
        kemSecretKey ?? undefined
      );

      // Decrypt and return the content
      const decryptedContent = await this.decryptZkimFile(
        zkimFile,
        userId,
        userKey
      );

      return {
        success: true,
        data: decryptedContent,
      };
    }, context);

    // Convert ServiceResult to expected return type
    if (result.success) {
      return {
        success: true,
        data: result.data?.data,
        error: result.error,
      };
    } else {
      return {
        success: false,
        error: result.error ?? "Unknown error",
      };
    }
  }
}
