# @zkim-platform/file-format

![npm version](https://img.shields.io/npm/v/@zkim-platform/file-format)
![npm downloads](https://img.shields.io/npm/dm/@zkim-platform/file-format)
![License](https://img.shields.io/npm/l/@zkim-platform/file-format)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Test Coverage](https://img.shields.io/badge/coverage-92%25-brightgreen)
![Build Status](https://github.com/zkdotim/zkim-file-format/actions/workflows/ci.yml/badge.svg?branch=main)

Secure, encrypted file format with three-layer encryption, integrity validation, and privacy-preserving search capabilities.

## 📊 Project Status

- **Version:** 1.0.0
- **Tests:** 1,307 passing (99.8% pass rate)
- **Coverage:** 92.09% statements, 82.15% branches, 95.83% functions
- **Build:** ✅ Passing
- **License:** MIT
- **Status:** Production Ready

## Features

- 🔐 **Three-Layer Encryption**: XChaCha20-Poly1305 encryption with platform, user, and content layers
- 🔍 **Privacy-Preserving Search**: Searchable encryption with OPRF-based trapdoors and rotation
- ✅ **Integrity Validation**: BLAKE3-based integrity checks and Ed25519 signatures
- 📦 **Compression Support**: Optional GZIP/Brotli compression for efficient storage
- 🛡️ **Error Recovery**: Advanced error detection and recovery mechanisms
- ⚡ **Performance Monitoring**: Built-in performance tracking and optimization
- 🔒 **Constant-Time Security**: Timing attack prevention for cryptographic operations
- 🌐 **Cross-Platform**: Works in both browser and Node.js environments

## Installation

```bash
npm install @zkim-platform/file-format
```

### Requirements

- Node.js 18+ (for Node.js environments)
- Modern browser with TypedArray and ES2020+ support (for browser environments)
- TypeScript 5.0+ (recommended for type safety)

### Dependencies

This package includes the following dependencies (automatically installed):

- `@noble/curves` - Ristretto255 operations for searchable encryption
- `@noble/hashes` - BLAKE3 hashing (standard ZKIM hash algorithm)
- `libsodium-wrappers-sumo` - Cryptographic operations (encryption, decryption, key generation)

These are bundled with the package and do not need to be installed separately.

## Quick Start

### Basic Usage

```typescript
import { ZKIMFileService, InMemoryStorage, defaultLogger } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

async function main() {
  // Wait for libsodium to be ready
  await sodium.ready;

  // Generate encryption keys
  const platformKey = sodium.randombytes_buf(32);
  const userKey = sodium.randombytes_buf(32);
  const userId = "example-user";

  // Create storage backend (optional - in-memory for this example)
  const storage = new InMemoryStorage();

  // Initialize the file service
  const fileService = new ZKIMFileService(
    {
      enableCompression: true,
      enableSearchableEncryption: false,
      enableIntegrityValidation: true,
    },
    defaultLogger,
    storage
  );

  await fileService.initialize();

  // Create some test data
  const testData = new TextEncoder().encode("Hello, ZKIM File Format!");

  // Create an encrypted ZKIM file
  const result = await fileService.createZkimFile(
    testData,
    userId,
    platformKey,
    userKey,
    {
      fileName: "example.txt",
      mimeType: "text/plain",
    }
  );

  if (!result.success || !result.file) {
    throw new Error("Failed to create file");
  }

  // File created successfully
  const fileId = result.file.header.fileId;

  // Retrieve the file
  const retrievedResult = await fileService.getZkimFile(
    result.objectId ?? result.file.header.fileId
  );

  if (!retrievedResult.success || !retrievedResult.data) {
    throw new Error(`Failed to retrieve file: ${retrievedResult.error}`);
  }

  // Decrypt the file
  const decryptedData = await fileService.decryptZkimFile(
    retrievedResult.data,
    userId,
    userKey
  );

  const decryptedText = new TextDecoder().decode(decryptedData);
  // File decrypted successfully

  // Cleanup
  await fileService.cleanup();
}

main().catch((error) => {
  // Handle error appropriately
  throw error;
});
```

## API Reference

### Core Services

#### `ZKIMFileService`

Main service for creating, managing, and operating on ZKIM files.

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";

const fileService = new ZKIMFileService(config?, logger?, storage?);
await fileService.initialize();

// Create a file
const result = await fileService.createZkimFile(
  content: Uint8Array,
  userId: string,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  metadata?: ZkimFileMetadata
);

// Retrieve a file
const file = await fileService.getZkimFile(objectId: string);

// Decrypt a file
const decrypted = await fileService.decryptZkimFile(
  file: ZkimFile,
  userId: string,
  userKey: Uint8Array
);
```

#### `ZkimEncryption`

Three-layer encryption service for encrypting and decrypting data.

```typescript
import { ZkimEncryption } from "@zkim-platform/file-format";

const encryption = new ZkimEncryption(config?, logger?);
await encryption.initialize();

// Encrypt data
const encrypted = await encryption.encryptData(
  data: Uint8Array,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  fileId: string,
  metadata?: Record<string, unknown>
);

// Decrypt data
const decrypted = await encryption.decrypt(
  encryptedData: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
);
```

#### `ZkimIntegrity`

Integrity validation service for validating file integrity and detecting tampering.

```typescript
import { ZkimIntegrity } from "@zkim-platform/file-format";

const integrity = new ZkimIntegrity(config?, logger?);
await integrity.initialize();

// Validate file
const result = await integrity.validateFile(
  file: ZkimFile,
  platformKey?: Uint8Array,
  userKey?: Uint8Array
);

// Detect tampering
const tampering = await integrity.detectTampering(file: ZkimFile);
```

#### `SearchableEncryption`

Privacy-preserving search service using OPRF-based trapdoors.

```typescript
import { SearchableEncryption } from "@zkim-platform/file-format";

const search = new SearchableEncryption(config?, logger?);
await search.initialize();

// Index a file
await search.indexFile(file: ZkimFile, keywords: string[]);

// Search for files
const results = await search.search(
  query: string,
  limit?: number
);
```

### Configuration Options

#### `ZKIMFileServiceConfig`

```typescript
interface ZKIMFileServiceConfig {
  enableCompression?: boolean;              // Enable compression (default: true)
  enableDeduplication?: boolean;            // Enable deduplication (default: true)
  chunkSize?: number;                       // Chunk size in bytes (default: 512KB)
  compressionLevel?: number;                // Compression level 1-9 (default: 6)
  compressionAlgorithm?: "brotli" | "gzip"; // Compression algorithm (default: "gzip")
  enableSearchableEncryption?: boolean;     // Enable searchable encryption (default: true)
  enableIntegrityValidation?: boolean;      // Enable integrity validation (default: true)
  enableMetadataIndexing?: boolean;         // Enable metadata indexing (default: true)
  maxFileSize?: number;                     // Maximum file size in bytes (default: 10GB)
  enableStreaming?: boolean;                // Enable streaming (default: true)
}
```

#### `ZkimEncryptionConfig`

```typescript
interface ZkimEncryptionConfig {
  enableThreeLayerEncryption?: boolean;     // Enable three-layer encryption (default: true)
  enableKeyRotation?: boolean;              // Enable key rotation (default: true)
  enablePerfectForwardSecrecy?: boolean;    // Enable PFS (default: true)
  enableCompromiseDetection?: boolean;      // Enable compromise detection (default: true)
  defaultAlgorithm?: string;                // Default encryption algorithm (default: "xchacha20-poly1305")
  keySize?: number;                         // Key size in bytes (default: 32)
  nonceSize?: number;                       // Nonce size in bytes (default: 24)
  compressionEnabled?: boolean;              // Enable compression (default: true)
  compressionAlgorithm?: "gzip" | "brotli"; // Compression algorithm (default: "gzip")
  compressionLevel?: number;                 // Compression level 1-9 (default: 6)
}
```

#### `ZkimIntegrityConfig`

```typescript
interface ZkimIntegrityConfig {
  enableHeaderValidation?: boolean;         // Enable header validation (default: true)
  enableChunkValidation?: boolean;          // Enable chunk validation (default: true)
  enableSignatureValidation?: boolean;      // Enable signature validation (default: true)
  enableMetadataValidation?: boolean;       // Enable metadata validation (default: true)
  enableTamperDetection?: boolean;          // Enable tamper detection (default: true)
  validationThreshold?: number;             // Validation threshold 0-1 (default: 0.95)
  enableAuditLogging?: boolean;             // Enable audit logging (default: true)
  enablePerformanceMetrics?: boolean;      // Enable performance metrics (default: true)
  hashAlgorithm?: string;                   // Hash algorithm (default: "blake3")
  signatureAlgorithm?: string;              // Signature algorithm (default: "ed25519")
}
```

### Storage Backends

#### `InMemoryStorage`

In-memory storage backend for testing and temporary storage.

```typescript
import { InMemoryStorage } from "@zkim-platform/file-format";

const storage = new InMemoryStorage();
const fileService = new ZKIMFileService(config, logger, storage);
```

#### `LocalStorageBackend`

Browser localStorage-based storage backend.

```typescript
import { LocalStorageBackend } from "@zkim-platform/file-format";

const storage = new LocalStorageBackend();
const fileService = new ZKIMFileService(config, logger, storage);
```

#### Custom Storage Backend

Implement the `IStorageBackend` interface for custom storage:

```typescript
import { IStorageBackend } from "@zkim-platform/file-format";

class CustomStorage implements IStorageBackend {
  async get(key: string): Promise<Uint8Array | null> {
    // Implement retrieval logic
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    // Implement storage logic
  }

  async delete(key: string): Promise<void> {
    // Implement deletion logic
  }

  async list(): Promise<string[]> {
    // Implement listing logic
  }
}
```

### Utilities

#### Crypto Utilities

```typescript
import {
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
} from "@zkim-platform/file-format";

// Generate random bytes
const randomBytes = await generateRandomBytes(32);

// Hash data
const hash = hashData(data, 32); // 32-byte hash
const hashHex = hashDataToHex(data, 32);

// Generate key pairs
const keyPair = await generateKeyPair(); // X25519
const signingKeyPair = await generateSigningKeyPair(); // Ed25519

// Encrypt/decrypt
const encrypted = await encryptData(data, key, nonce);
const decrypted = await decryptData(encrypted.ciphertext, key, encrypted.nonce);

// Base64 encoding
const base64 = await toBase64(data);
const decoded = await fromBase64(base64);
```

#### Compression Utilities

```typescript
import { compressGzip, decompressGzip } from "@zkim-platform/file-format";

// Compress data
const compressed = await compressGzip(data);

// Decompress data
const decompressed = await decompressGzip(compressed);
```

## Examples

### Example 1: Basic File Encryption

```typescript
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

await sodium.ready;

const platformKey = sodium.randombytes_buf(32);
const userKey = sodium.randombytes_buf(32);
const storage = new InMemoryStorage();

const fileService = new ZKIMFileService(
  { enableCompression: true },
  undefined,
  storage
);
await fileService.initialize();

const content = new TextEncoder().encode("Secret message");
const result = await fileService.createZkimFile(
  content,
  "user-123",
  platformKey,
  userKey,
  { fileName: "secret.txt", mimeType: "text/plain" }
);

if (result.success && result.file) {
  // File created successfully
  const fileId = result.file.header.fileId;
}
```

### Example 2: Integrity Validation

```typescript
import { ZkimIntegrity } from "@zkim-platform/file-format";

const integrity = new ZkimIntegrity();
await integrity.initialize();

const validationResult = await integrity.validateFile(
  zkimFile,
  platformKey,
  userKey
);

if (validationResult.isValid) {
  // File is valid
} else {
  // Handle validation errors
  const errors = validationResult.errors;
}
```

### Example 3: Searchable Encryption

```typescript
import { SearchableEncryption } from "@zkim-platform/file-format";

const search = new SearchableEncryption();
await search.initialize();

// Index a file with keywords
await search.indexFile(zkimFile, ["document", "important", "2025"]);

// Search for files
const results = await search.search("document", 10);
// Found results.length files
```

## Security Considerations

### Web Crypto API Prohibition

**CRITICAL**: This package **PROHIBITS** the use of Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`, `window.crypto`) for security and consistency reasons.

**Required patterns:**
- ✅ Use `libsodium-wrappers-sumo` for all cryptographic operations
- ✅ Use `@noble/hashes` for BLAKE3 hashing
- ✅ Use `sodium.randombytes_buf()` for random number generation
- ✅ Always call `await sodium.ready` before using libsodium functions

**Forbidden patterns:**
- ❌ `crypto.subtle.*` - All Web Crypto API subtle methods
- ❌ `crypto.getRandomValues()` - Web Crypto API random generation
- ❌ `window.crypto.*` - Web Crypto API access
- ❌ `WebCrypto`, `CryptoKey`, `SubtleCrypto` - Web Crypto API types

This prohibition is enforced by ESLint and will cause build failures if violated.

### Key Management

- **Never store keys in plaintext**: Always use secure key storage mechanisms
- **Use proper key derivation**: Use Argon2id for password-based key derivation
- **Rotate keys regularly**: Implement key rotation policies
- **Protect keys in memory**: Clear sensitive data from memory when possible

### Best Practices

1. **Always validate file integrity** before decryption
2. **Use constant-time comparisons** for security-sensitive operations
3. **Enable all security features** in production (integrity validation, signature verification)
4. **Monitor for tampering** using `detectTampering()`
5. **Use secure random number generation** for all cryptographic operations
6. **Implement proper error handling** to avoid information leakage

### Cryptographic Algorithms

- **Encryption**: XChaCha20-Poly1305 (AEAD) via libsodium
- **Hashing**: BLAKE3 (256-bit output) via @noble/hashes
- **Signatures**: Ed25519 via libsodium
- **Key Exchange**: X25519 via libsodium
- **Searchable Encryption**: OPRF (Oblivious Pseudorandom Function) via @noble/curves
- **Random Generation**: libsodium `randombytes_buf()`

## Troubleshooting

### Common Issues

#### "libsodium is not ready"

**Solution**: Always wait for `sodium.ready` before using cryptographic functions:

```typescript
import sodium from "libsodium-wrappers-sumo";
await sodium.ready;
// Now you can use crypto functions
```

#### "Storage backend not available"

**Solution**: Provide a storage backend or use `InMemoryStorage`:

```typescript
const storage = new InMemoryStorage();
const fileService = new ZKIMFileService(config, logger, storage);
```

#### "Decryption failed"

**Possible causes**:
- Wrong encryption key
- Corrupted file data
- Missing nonce or metadata

**Solution**: Validate file integrity first, then check keys:

```typescript
const validation = await integrity.validateFile(file, platformKey, userKey);
if (!validation.isValid) {
  // Handle validation errors
  const errors = validation.errors;
}
```

#### "Compression not working"

**Solution**: 
- **Node.js**: `zlib` is built-in and used automatically
- **Browser**: The package includes fallback compression using `pako`-compatible algorithms. No additional installation needed.

If you encounter compression issues, ensure your environment supports TypedArray operations.

## TypeScript Support

This package is written in TypeScript and includes full type definitions. All types are exported and can be imported:

```typescript
import type {
  ZkimFile,
  ZkimFileHeader,
  ZkimFileMetadata,
  ZKIMFileServiceConfig,
  ZkimEncryptionConfig,
  SearchQuery,
  SearchResult,
} from "@zkim-platform/file-format";
```

## Browser Support

This package works in modern browsers with:
- TypedArray support
- ES2020+ features
- ES Modules support
- `libsodium-wrappers-sumo` for cryptographic operations
- `@noble/hashes` for BLAKE3 hashing

Tested in:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Node.js Support

This package works in Node.js 18+ with:
- Built-in `zlib` for compression (GZIP)
- `libsodium-wrappers-sumo` for cryptographic operations
- `@noble/hashes` for BLAKE3 hashing
- ES Modules (ESM) support

## Contributing

Contributions are welcome! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/zkdotim/zkim-file-format.git
cd zkim-file-format

# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Generate test coverage
npm run test:coverage
```

### CI/CD

This package uses GitHub Actions for continuous integration:

- **Lint & Type Check**: Runs on every push and pull request
- **Tests**: Automated testing with coverage reporting
- **Build**: Verifies package builds successfully
- **Security**: Automated security scanning
- **Publishing**: Automated npm publishing on release tags

See `.github/workflows/` for workflow definitions.

## 📊 Statistics

- **Total Tests:** 1,307 (1,305 passing, 2 skipped)
- **Test Coverage:** 92.09% statements, 82.15% branches, 95.83% functions, 92.16% lines
- **Dependencies:** 3 production dependencies (libsodium, @noble/hashes, @noble/curves)
- **Bundle Size:** ~384 KB (ESM), ~390 KB (CJS)
- **TypeScript:** Full type definitions included

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Quick Start for Contributors

```bash
# Clone the repository
git clone https://github.com/zkdotim/zkim-file-format.git
cd zkim-file-format

# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint

# Build the package
npm run build
```

## 📚 Support & Resources

- 📖 [Full Documentation](./README.md)
- 🐛 [Report a Bug](https://github.com/zkdotim/zkim-file-format/issues/new?template=bug_report.md)
- 💡 [Request a Feature](https://github.com/zkdotim/zkim-file-format/issues/new?template=feature_request.md)
- ❓ [Ask a Question](https://github.com/zkdotim/zkim-file-format/issues/new?template=question.md)
- 💬 [Discussions](https://github.com/zkdotim/zkim-file-format/discussions)
- 🔒 [Security Policy](./.github/SECURITY.md)
- 📜 [Code of Conduct](./CODE_OF_CONDUCT.md)

## 📄 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a list of changes and version history.

## 📜 License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Made with ❤️ by the ZKIM Team**
