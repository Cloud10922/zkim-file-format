# API Reference

Complete API documentation for `@zkim-platform/file-format`.

---

## ZKIMFileService

Main service for creating, managing, and operating on ZKIM files.

### Constructor

```typescript
new ZKIMFileService(
  config?: Partial<ZKIMFileServiceConfig>,
  logger?: ILogger,
  storageService?: IStorageBackend
)
```

**Parameters:**
- `config` - Service configuration (optional)
- `logger` - Logger instance (optional, defaults to `defaultLogger`)
- `storageService` - Storage backend (optional, defaults to `null`)

### Methods

#### `initialize(): Promise<void>`

Initializes the service and all dependent services.

```typescript
await fileService.initialize();
```

#### `cleanup(): Promise<void>`

Cleans up resources and dependent services.

```typescript
await fileService.cleanup();
```

#### `createZkimFile()`

Creates a new encrypted ZKIM file.

```typescript
createZkimFile(
  data: Uint8Array | string,
  userId: string,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  metadata?: Partial<ZkimFileMetadata>,
  skipCasStorage?: boolean
): Promise<ZkimFileResult>
```

**Parameters:**
- `data` - File data (Uint8Array or string)
- `userId` - User identifier
- `platformKey` - Platform encryption key (32 bytes)
- `userKey` - User encryption key (32 bytes)
- `metadata` - File metadata (optional)
- `skipCasStorage` - Skip CAS storage (optional, default: false)

**Returns:** `Promise<ZkimFileResult>`

**Example:**
```typescript
const result = await fileService.createZkimFile(
  new TextEncoder().encode("Hello, World!"),
  "user-123",
  platformKey,
  userKey,
  {
    fileName: "hello.txt",
    mimeType: "text/plain",
  }
);
```

#### `downloadFile()`

Downloads and decrypts a ZKIM file. **Requires explicit `platformKey` and `userKey` parameters for security.**

⚠️ **SECURITY:** Keys must be derived from actual user authentication, not generated deterministically. See [Authentication Integration](Authentication-Integration.md) for proper key derivation.

```typescript
downloadFile(
  objectId: string,
  userId: string,
  platformKey: Uint8Array,
  userKey: Uint8Array
): Promise<{
  success: boolean;
  data?: Uint8Array;
  error?: string;
}>
```

**Parameters:**
- `objectId` - File identifier
- `userId` - User identifier
- `platformKey` - Platform encryption key (32 bytes, must be same as used for creation)
- `userKey` - User encryption key (32 bytes, must be derived from authentication)

**Returns:** `Promise<{ success: boolean; data?: Uint8Array; error?: string }>`

**Example:**
```typescript
// Derive keys from authentication
const userKey = await deriveKeyFromWallet(walletAddress, signature);
const platformKey = await getPlatformKey(); // From secure storage

const result = await fileService.downloadFile(
  "file-id",
  userId,
  platformKey,
  userKey
);
if (result.success && result.data) {
  const text = new TextDecoder().decode(result.data);
}
```

#### `getZkimFile()`

Retrieves a ZKIM file object without decryption.

```typescript
getZkimFile(
  objectId: string
): Promise<{
  success: boolean;
  data?: ZkimFile;
  error?: string;
}>
```

**Parameters:**
- `objectId` - File identifier

**Returns:** `Promise<{ success: boolean; data?: ZkimFile; error?: string }>`

#### `searchFiles()`

Searches files using privacy-preserving search.

```typescript
searchFiles(
  query: string,
  userId: string,
  limit?: number
): Promise<SearchResult>
```

**Parameters:**
- `query` - Search query string
- `userId` - User identifier
- `limit` - Maximum results (optional)

**Returns:** `Promise<SearchResult>`

**Example:**
```typescript
const result = await fileService.searchFiles("example", "user-123", 10);
console.log(`Found ${result.totalResults} files`);
```

#### `validateFileIntegrity()`

Validates file integrity and signatures. Keys are retrieved internally if needed for signature validation.

```typescript
validateFileIntegrity(
  zkimFile: ZkimFile
): Promise<IntegrityValidationResult>
```

**Parameters:**
- `zkimFile` - ZKIM file object

**Returns:** `Promise<IntegrityValidationResult>`

**Example:**
```typescript
const validation = await fileService.validateFileIntegrity(file);
if (!validation.isValid) {
  console.error("File integrity check failed:", validation.errors);
}
```

---

## ZkimEncryption

Service for encryption and decryption operations.

### Methods

#### `encryptData()`

Encrypts data with three-layer encryption.

```typescript
encryptData(
  data: Uint8Array,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  fileId: string,
  customFields?: Record<string, unknown>
): Promise<EncryptionResult>
```

#### `decrypt()`

Decrypts encrypted data.

```typescript
decrypt(
  encryptedData: Uint8Array,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  fileId: string
): Promise<Uint8Array>
```

#### `decryptChunk()`

Decrypts a single chunk.

```typescript
decryptChunk(
  encryptedChunk: Uint8Array,
  keyId: string,
  fileId: string,
  chunkIndex: number
): Promise<Uint8Array>
```

#### `decryptUserLayer()`

Decrypts user layer to extract content key.

```typescript
decryptUserLayer(
  userEncrypted: Uint8Array,
  userNonce: Uint8Array,
  userKey: Uint8Array
): Promise<{
  contentKey: Uint8Array;
  metadata?: Record<string, unknown>;
}>
```

---

## ZkimIntegrity

Service for integrity validation and tamper detection.

### Methods

#### `validateFile()`

Validates file integrity.

```typescript
validateFile(
  zkimFile: ZkimFile
): Promise<IntegrityValidationResult>
```

#### `validateHeader()`

Validates file header.

```typescript
validateHeader(
  header: ZkimFileHeader
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
}>
```

#### `validateSignatures()`

Validates file signatures.

```typescript
validateSignatures(
  zkimFile: ZkimFile,
  platformKey?: Uint8Array,
  userKey?: Uint8Array
): Promise<{
  isValid: boolean;
  errors: string[];
}>
```

---

## SearchableEncryption

Service for privacy-preserving search.

### Methods

#### `indexFile()`

Indexes a file for search.

```typescript
indexFile(
  fileId: string,
  metadata: ZkimFileMetadata,
  trapdoor: Trapdoor
): Promise<void>
```

#### `search()`

Searches indexed files.

```typescript
search(
  query: SearchQuery,
  limit?: number
): Promise<SearchResult>
```

#### `updateFileIndex()`

Updates file index.

```typescript
updateFileIndex(
  fileId: string,
  metadata: ZkimFileMetadata
): Promise<void>
```

---

## Storage Backends

### IStorageBackend

Interface for storage backends.

```typescript
interface IStorageBackend {
  set(key: string, value: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
```

### InMemoryStorage

In-memory storage implementation.

```typescript
class InMemoryStorage implements IStorageBackend {
  // Implementation
}
```

### LocalStorageBackend

Browser localStorage implementation.

```typescript
class LocalStorageBackend implements IStorageBackend {
  constructor(prefix?: string);
  // Implementation
}
```

---

## Types

### ZkimFile

Complete ZKIM file structure.

```typescript
interface ZkimFile {
  header: ZkimFileHeader;
  chunks: ZkimFileChunk[];
  metadata: ZkimFileMetadata;
  platformSignature: Uint8Array;  // ML-DSA-65 (3,309 bytes)
  userSignature: Uint8Array;       // ML-DSA-65 (3,309 bytes)
  contentSignature: Uint8Array;     // ML-DSA-65 (3,309 bytes)
}
```

### ZkimFileHeader

File header structure.

```typescript
interface ZkimFileHeader {
  magic: "ZKIM";           // Magic bytes identifier
  version: 1;              // Format version
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
  signatureType: 1;        // ML-DSA-65 (FIPS 204)
}
```

### ZkimFileMetadata

File metadata structure.

```typescript
interface ZkimFileMetadata {
  fileName: string;
  mimeType: string;
  userId?: string;
  createdAt: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  accessControl?: {
    readAccess: string[];
    writeAccess: string[];
    deleteAccess: string[];
  };
}
```

### ZkimFileResult

Result of file creation.

```typescript
interface ZkimFileResult {
  success: boolean;
  file: ZkimFile;              // Created file object
  zkimFile: ZkimFile;          // Alias for file (backward compatibility)
  objectId: string;            // File identifier for storage
  size: number;                // Original file size in bytes
  chunks: number;              // Number of chunks
  processingTime: number;      // Processing time in milliseconds
  compressionRatio: number;     // Compression ratio (compressed/original)
  encryptionOverhead: number;   // Encryption overhead ratio
}
```

### SearchResult

Search result structure.

```typescript
interface SearchResult {
  queryId: string;
  results: ZkimFileSearchResult[];
  totalResults: number;
  processingTime: number;
  privacyLevel: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
}
```

### IntegrityValidationResult

Integrity validation result.

```typescript
interface IntegrityValidationResult {
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
```

---

## Configuration

### ZKIMFileServiceConfig

Service configuration options.

```typescript
interface ZKIMFileServiceConfig {
  enableCompression?: boolean;           // Default: true
  enableDeduplication?: boolean;         // Default: true
  chunkSize?: number;                    // Default: 512KB
  compressionLevel?: number;             // Default: 6
  compressionAlgorithm?: "gzip" | "brotli"; // Default: "gzip"
  enableSearchableEncryption?: boolean;   // Default: true
  enableIntegrityValidation?: boolean;     // Default: true
  enableMetadataIndexing?: boolean;        // Default: true
  maxFileSize?: number;                   // Default: 10GB
  enableStreaming?: boolean;               // Default: true
}
```

---

## Constants

### ZKIM_ENCRYPTION_CONSTANTS

Encryption-related constants.

```typescript
export const ZKIM_ENCRYPTION_CONSTANTS = {
  DEFAULT_ALGORITHM: "xchacha20-poly1305",
  KEY_SIZE: 32,
  NONCE_SIZE: 24,
  TAG_SIZE: 16,
  // Post-Quantum ML-DSA-65 (FIPS 204)
  ML_DSA_65_PUBLIC_KEY_SIZE: 1952,
  ML_DSA_65_SECRET_KEY_SIZE: 4032,
  ML_DSA_65_SIGNATURE_SIZE: 3309,
  // Post-Quantum ML-KEM-768 (FIPS 203)
  ML_KEM_768_PUBLIC_KEY_SIZE: 1184,
  ML_KEM_768_SECRET_KEY_SIZE: 2400,
  ML_KEM_768_CIPHERTEXT_SIZE: 1088,
  // Version identifiers
  VERSION: 0x0001,
  // Magic bytes
  MAGIC: "ZKIM",
} as const;
```

### ZKIM_FILE_SERVICE_CONSTANTS

File service constants.

```typescript
export const ZKIM_FILE_SERVICE_CONSTANTS = {
  DEFAULT_MAGIC: "ZKIM",
  DEFAULT_VERSION: 1,
} as const;
```

### FILE_PROCESSING_CONSTANTS

File processing constants.

```typescript
export const FILE_PROCESSING_CONSTANTS = {
  DEFAULT_CHUNK_SIZE: 512 * 1024,  // 512 KiB
  MAX_CHUNK_SIZE: 1024 * 1024,     // 1MB
  MIN_CHUNK_SIZE: 1024,            // 1KB
  DEFAULT_MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB
  COMPRESSION_LEVEL: 6,
  DEFAULT_COMPRESSION_ALGORITHM: "gzip",
} as const;
```

---

## Error Types

### ServiceError

Base service error class.

```typescript
class ServiceError extends Error {
  code: string;
  details?: Record<string, unknown>;
}
```

### ZKIMFileError

File operation error.

```typescript
class ZKIMFileError extends ServiceError {
  // File-specific error
}
```

### ZKIMEncryptionError

Encryption operation error.

```typescript
class ZKIMEncryptionError extends ServiceError {
  // Encryption-specific error
}
```

### ZKIMIntegrityError

Integrity validation error.

```typescript
class ZKIMIntegrityError extends ServiceError {
  // Integrity-specific error
}
```

### ZKIMStorageError

Storage operation error.

```typescript
class ZKIMStorageError extends ServiceError {
  // Storage-specific error
}
```

---

## Utilities

### ErrorUtils

Error handling utilities.

```typescript
class ErrorUtils {
  static createContext(
    service: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): ErrorContext;

  static withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<ServiceResult<T>>;
}
```

### Logger

Logging interface.

```typescript
interface ILogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
```

---

## Wire Format Utilities

### writeWireFormat()

Writes ZKIM file to wire format.

```typescript
writeWireFormat(
  header: ZkimFileHeader,
  ehPlatform: Uint8Array,
  ehUser: Uint8Array,
  chunks: ZkimFileChunk[],
  merkleRoot: Uint8Array,
  fileSignature: Uint8Array,
  logger?: ILogger
): Uint8Array
```

### parseZkimFile()

Parses wire format to ZKIM file.

```typescript
parseZkimFile(
  wireFormat: Uint8Array,
  platformKey: Uint8Array,
  userKey: Uint8Array
): Promise<ZkimFile>
```

---

**Last Updated:** 2026-01-09

