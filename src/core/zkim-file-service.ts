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

      if (
        typeof sodium.crypto_generichash !== "function" ||
        typeof sodium.randombytes_buf !== "function"
      ) {
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

      const encryptionService = await ZkimEncryption.getServiceInstance();
      const encryptionResult = await encryptionService.encryptData(
        processedData.compressedData,
        platformKey,
        userKey,
        fileId,
        fileMetadata.customFields
      );

      const contentEncryptedData = encryptionResult.contentEncrypted;
      const [platformNonce, userNonce, contentNonce] = encryptionResult.nonces;
      const { contentKey } = encryptionResult;

      fileMetadata.customFields = {
        ...fileMetadata.customFields,
        encryptionType: "3-layer-zkim",
        platformEncrypted: sodium.to_base64(encryptionResult.platformEncrypted),
        userEncrypted: sodium.to_base64(encryptionResult.userEncrypted),
        platformNonce: platformNonce ? sodium.to_base64(platformNonce) : "",
        userNonce: userNonce ? sodium.to_base64(userNonce) : "",
        contentNonce: contentNonce ? sodium.to_base64(contentNonce) : "",
        contentKey: contentKey ? sodium.to_base64(contentKey) : "", // Store content key for direct access during decryption
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

      const ALG_SUITE_ID = 0x01; // XChaCha20-Poly1305 + Ed25519 + BLAKE3
      const algSuiteId = ALG_SUITE_ID;
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

        let contentKey: Uint8Array;
        const contentKeyBase64 = customFields.contentKey as string | undefined;

        if (contentKeyBase64) {
          contentKey = sodium.from_base64(contentKeyBase64);
          this.logger.debug("Using stored content key from wire format");
        } else {
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

          const { contentKey: decryptedContentKey } =
            await encryptionService.decryptUserLayer(
              userEncrypted,
              userKey,
              userNonce
            );
          contentKey = decryptedContentKey;
          this.logger.debug("Decrypted user layer to get content key");
        }

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
            signatureType: 1, // Ed25519
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
          platformSignature: new Uint8Array(64),
          userSignature: new Uint8Array(64),
          contentSignature: new Uint8Array(64),
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
   * Expand Ed25519 seed (32 bytes) to full private key (64 bytes)
   * Ed25519 requires 64-byte private keys: seed (32) + public key (32)
   */
  private expandEd25519Key(seed: Uint8Array): Uint8Array {
    if (seed.length === 64) {
      // Already 64 bytes, return as-is
      return seed;
    }
    if (seed.length !== 32) {
      throw new ServiceError(
        `Invalid Ed25519 seed length: expected 32 bytes, got ${seed.length}`,
        {
          code: "INVALID_ED25519_SEED_LENGTH",
          details: {
            expectedLength: 32,
            actualLength: seed.length,
          },
        }
      );
    }

    // Extract public key from seed using libsodium
    const { publicKey } = sodium.crypto_sign_seed_keypair(seed);
    // Expand to 64 bytes: seed (32) + public key (32)
    const expandedKey = new Uint8Array(64);
    expandedKey.set(seed, 0); // Seed
    expandedKey.set(publicKey, 32); // Public key

    this.logger.debug("Ed25519 key expanded from 32 to 64 bytes", {
      originalLength: 32,
      expandedLength: expandedKey.length,
    });

    return expandedKey;
  }

  /**
   * Derive a 64-byte Ed25519 signing key from a 32-byte encryption key
   * Used as fallback when signing keys are not provided in metadata
   */
  private deriveSigningKeyFromEncryptionKey(
    encryptionKey: Uint8Array
  ): Uint8Array {
    // Derive a 32-byte seed from the encryption key using BLAKE3
    const seed = blake3(encryptionKey, { dkLen: 32 });
    // Generate a proper Ed25519 keypair from the seed
    const keypair = sodium.crypto_sign_seed_keypair(seed);
    // Return the 64-byte private key (which includes the public key)
    return keypair.privateKey;
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
   * Validate Ed25519 private key length
   */
  private validateEd25519KeyLength(
    key: Uint8Array,
    keyType: "platform" | "user",
    base64Length?: number
  ): void {
    if (
      key.length !== ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE &&
      key.length !== 32
    ) {
      // Allow 32 bytes (seed) as it will be expanded
      throw new ServiceError(
        `Invalid ${keyType} signing key length: expected 32 or 64 bytes (Ed25519), got ${key.length}`,
        {
          code: "INVALID_SIGNING_KEY_LENGTH",
          details: {
            keyType,
            expectedLength: "32 or 64 bytes",
            actualLength: key.length,
            base64Length,
          },
        }
      );
    }
  }

  /**
   * Get or derive Ed25519 signing key from metadata or encryption key
   * Handles base64 decoding, key expansion, and fallback derivation
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
      let decodedKey = await this.decodeBase64SigningKey(base64Key, keyType);

      this.logger.debug(`${keyType} sign key decoded from base64`, {
        base64Length: base64Key.length,
        decodedLength: decodedKey.length,
        expectedLength: ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE,
      });

      // Validate length
      this.validateEd25519KeyLength(decodedKey, keyType, base64Key.length);

      // Expand if needed (32-byte seed to 64-byte private key)
      if (decodedKey.length === 32) {
        decodedKey = this.expandEd25519Key(decodedKey);
        this.logger.debug(`${keyType} sign key expanded from 32 to 64 bytes`, {
          originalLength: 32,
          expandedLength: decodedKey.length,
        });
      }

      // Final validation - must be 64 bytes after expansion
      if (
        decodedKey.length !== ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE
      ) {
        throw new ServiceError(
          `Invalid ${keyType} signing key length: expected ${ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE} bytes (Ed25519), got ${decodedKey.length}`,
          {
            code: "INVALID_SIGNING_KEY_LENGTH",
            details: {
              keyType,
              expectedLength:
                ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE,
              actualLength: decodedKey.length,
            },
          }
        );
      }

      return decodedKey;
    } else {
      // Fallback: derive from encryption key (not ideal, but works)
      this.logger.debug(
        `Deriving ${keyType} signing key from encryption key (fallback)`
      );
      return this.deriveSigningKeyFromEncryptionKey(encryptionKey);
    }
  }

  private async generateFileId(
    data: Uint8Array,
    userId: string
  ): Promise<string> {
    await sodium.ready;

    // Diagnostic check for libsodium functions
    if (typeof sodium.crypto_generichash !== "function") {
      const availableFunctions = Object.keys(sodium)
        .filter((k) => k.includes("crypto") || k.includes("random"))
        .slice(0, 10);
      throw new ServiceError(
        `libsodium crypto_generichash not available. Available functions: ${availableFunctions.join(", ")}. ` +
          `sodium type: ${typeof sodium}, has ready: ${typeof sodium.ready}`,
        { code: "LIBSODIUM_FUNCTION_UNAVAILABLE" }
      );
    }

    const hash = sodium.crypto_generichash(
      ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE,
      data
    );
    const userIdHash =
      typeof userId === "string"
        ? sodium.crypto_generichash(
            ZKIM_ENCRYPTION_CONSTANTS.ED25519_PUBLIC_KEY_SIZE,
            new TextEncoder().encode(userId)
          )
        : sodium.crypto_generichash(
            ZKIM_ENCRYPTION_CONSTANTS.ED25519_PUBLIC_KEY_SIZE,
            userId
          );
    const combined = new Uint8Array(hash.length + userIdHash.length);
    combined.set(hash, 0);
    combined.set(userIdHash, hash.length);
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
      magic: "ZKIM",
      version: 1,
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
      signatureType: 1, // Ed25519
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
    await sodium.ready;
    return sodium.crypto_generichash(
      ZKIM_ENCRYPTION_CONSTANTS.MERKLE_ROOT_SIZE,
      data
    );
  }

  private async getUserKey(userId: string): Promise<Uint8Array> {
    // This should retrieve the user's key from a secure key store
    // For now, we'll generate a deterministic key based on userId
    await sodium.ready;
    const data = `${ZKIM_FILE_SERVICE_CONSTANTS.USER_KEY_PREFIX}${userId}`;
    const hash = sodium.crypto_generichash(
      ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE,
      data
    );
    return hash;
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

    // Validate key length - must be Ed25519 private key (64 bytes)
    this.logger.info("signData called", {
      keyLength: key.length,
      expectedLength: ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE,
      messageLength: message.length,
    });

    if (key.length !== ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE) {
      throw new ServiceError(
        `Invalid signing key length: expected ${ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE} bytes (Ed25519 private key), got ${key.length}`,
        {
          code: "INVALID_SIGNING_KEY_LENGTH",
          details: {
            expectedLength: ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE,
            actualLength: key.length,
          },
        }
      );
    }

    // Sign with Ed25519 private key
    this.logger.info("About to call crypto_sign_detached", {
      keyLength: key.length,
      messageLength: message.length,
      keyType: key.constructor.name,
      messageType: message.constructor.name,
    });

    try {
      const signature = sodium.crypto_sign_detached(message, key);
      this.logger.info("signData succeeded", {
        signatureLength: signature.length,
        keyLength: key.length,
      });
      return signature;
    } catch (error) {
      // libsodium might throw its own error about invalid key length
      // libsodium can throw strings, not just Error objects
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        "libsodium crypto_sign_detached failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          keyLength: key.length,
          expectedLength: ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE,
          errorMessage,
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
          errorString: String(error),
        }
      );
      throw new ServiceError(
        `libsodium crypto_sign_detached failed: ${errorMessage}`,
        {
          code: "LIBSODIUM_SIGN_FAILED",
          details: {
            keyLength: key.length,
            expectedLength: ZKIM_ENCRYPTION_CONSTANTS.ED25519_PRIVATE_KEY_SIZE,
            errorMessage,
            errorType:
              error instanceof Error ? error.constructor.name : typeof error,
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
   * Cleanup method required by ServiceBase
   */
  public async cleanup(): Promise<void> {
    const context = ErrorUtils.createContext("ZKIMFileService", "cleanup", {
      severity: "medium",
    });

    await ErrorUtils.withErrorHandling(async () => {
      this.logger.info("Cleaning up ZKIM File Service");

      // Cleanup all service instances that were initialized
      // This ensures timers are cleared and resources are freed
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

        await Promise.all(cleanupPromises);
      } catch (error) {
        this.logger.warn("Error during service cleanup", { error });
      }

      this.logger.info("ZKIM File Service cleanup completed");
    }, context);
  }

  /**
   * Download a ZKIM file by object ID
   */
  public async downloadFile(
    objectId: string,
    userId: string
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

      // Get user key and platform key for parsing (wire format needs both)
      const userKey = await this.getUserKey(userId);

      // For platform key, we need to generate or retrieve it
      // Platform key should be consistent - use a deterministic key based on userId
      await sodium.ready;
      // Generate platform key deterministically (for now - should be stored securely)
      const platformKeySeed = new TextEncoder().encode(
        `platform-key-${userId}`
      );
      const platformKey = sodium.crypto_generichash(
        ZKIM_ENCRYPTION_CONSTANTS.KEY_SIZE,
        platformKeySeed
      );

      // Parse the ZKIM file (detects format automatically)
      const encryptionService = await ZkimEncryption.getServiceInstance();
      const zkimFile = await parseZkimFile(
        storedContent,
        userKey,
        platformKey,
        encryptionService,
        this.logger
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
