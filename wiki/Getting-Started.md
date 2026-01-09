# Getting Started

This guide will help you get started with `@zkim-platform/file-format` in minutes.

## Installation

```bash
npm install @zkim-platform/file-format
```

### Requirements

- **Node.js:** 18+ (for Node.js environments)
- **Browser:** Modern browser with TypedArray and ES2020+ support
- **TypeScript:** 5.0+ (recommended for type safety)

### Dependencies

The package includes all required dependencies:
- `@noble/curves` - Ristretto255 operations for searchable encryption
- `@noble/hashes` - BLAKE3 hashing (standard ZKIM hash algorithm)
- `@noble/post-quantum` - ML-DSA-65 and ML-KEM-768 (post-quantum cryptography)
- `libsodium-wrappers-sumo` - Cryptographic operations (encryption, decryption, key generation)

These are automatically installed with the package.

---

## Quick Start

### 1. Basic Setup

```typescript
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

async function main() {
  // Wait for libsodium to be ready
  await sodium.ready;

  // ⚠️ NOTE: This example uses random keys for simplicity
  // In production, derive keys from actual user authentication
  // See Authentication Integration guide for proper key derivation
  
  // Platform key (store securely, same for all users)
  const platformKey = sodium.randombytes_buf(32);
  
  // User key (in production, derive from user authentication)
  // Example: const userKey = await deriveKeyFromWallet(walletAddress, signature);
  const userKey = sodium.randombytes_buf(32);
  const userId = "example-user";

  // Create storage backend (in-memory for this example)
  const storage = new InMemoryStorage();

  // Initialize the file service
  const fileService = new ZKIMFileService(
    {
      enableCompression: true,
      enableSearchableEncryption: false,
      enableIntegrityValidation: true,
    },
    undefined,
    storage
  );

  await fileService.initialize();

  // Your code here...

  await fileService.cleanup();
}

main().catch(console.error);
```

### 2. Create Your First ZKIM File

```typescript
// Create some data
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

if (result.success && result.file) {
  console.log("File created:", result.file.header.fileId);
  console.log("File size:", result.file.header.totalSize, "bytes");
  console.log("Chunks:", result.file.header.chunkCount);
}
```

### 3. Download and Decrypt

```typescript
// Download and decrypt the file
// ⚠️ NOTE: downloadFile requires platformKey and userKey for security
const decrypted = await fileService.downloadFile(
  result.file.header.fileId,
  userId,
  platformKey,
  userKey
);

if (decrypted.success && decrypted.data) {
  const text = new TextDecoder().decode(decrypted.data);
  console.log("Decrypted content:", text);
}
```

---

## Configuration Options

### ZKIMFileServiceConfig

```typescript
interface ZKIMFileServiceConfig {
  enableCompression?: boolean;           // Enable GZIP/Brotli compression (default: true)
  enableDeduplication?: boolean;         // Enable content deduplication (default: true)
  chunkSize?: number;                    // Chunk size in bytes (default: 512KB)
  compressionLevel?: number;             // Compression level 1-9 (default: 6)
  compressionAlgorithm?: "gzip" | "brotli"; // Compression algorithm (default: "gzip")
  enableSearchableEncryption?: boolean;   // Enable privacy-preserving search (default: true)
  enableIntegrityValidation?: boolean;     // Enable integrity validation (default: true)
  enableMetadataIndexing?: boolean;        // Enable metadata indexing (default: true)
  maxFileSize?: number;                   // Maximum file size in bytes (default: 10GB)
  enableStreaming?: boolean;               // Enable streaming support (default: true)
}
```

### Example Configuration

```typescript
const fileService = new ZKIMFileService({
  enableCompression: true,
  enableSearchableEncryption: true,
  enableIntegrityValidation: true,
  chunkSize: 1024 * 1024, // 1MB chunks
  compressionLevel: 9,     // Maximum compression
  compressionAlgorithm: "brotli",
});
```

---

## Storage Backends

The file service requires a storage backend to persist files. You can use:

### Built-in Storage

```typescript
import { InMemoryStorage, LocalStorageBackend } from "@zkim-platform/file-format";

// In-memory storage (for testing)
const storage = new InMemoryStorage();

// Browser localStorage (for browser environments)
const storage = new LocalStorageBackend("my-prefix:");
```

### Custom Storage

For production use, implement a custom storage backend. See **[Storage Integration](Storage-Integration.md)** for complete guide with examples for:
- AWS S3
- Azure Blob Storage
- Google Cloud Storage
- IPFS
- Database storage (PostgreSQL, MongoDB)
- REST API backends

---

## Authentication & Key Management

### Authentication-Agnostic Design

`@zkim-platform/file-format` works with **any authentication method** (wallets, OAuth, email/password, etc.). The package only needs:

- **`userId`** - Any unique string identifier (wallet address, email, UUID, etc.)
- **`userKey`** - 32-byte encryption key **derived from user authentication**
- **`platformKey`** - 32-byte platform-wide encryption key

**⚠️ CRITICAL:** Never use random keys in production. Keys must be **derived from actual user authentication** so users can decrypt their files later.

### Platform Key

The platform key is shared across all users on your platform:

```typescript
import sodium from "libsodium-wrappers-sumo";

await sodium.ready;

// Generate platform key (do this once, store securely)
const platformKey = sodium.randombytes_buf(32);

// Store in key management service (AWS KMS, Azure Key Vault, etc.)
// Never hardcode in source code!
```

### User Key Derivation

User keys must be **deterministic** - same user + same auth = same key. Derive keys from authentication:

```typescript
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

// Generic key derivation function
async function deriveUserKey(
  userId: string,
  authCredential: string // Signature, OAuth token, password hash, etc.
): Promise<Uint8Array> {
  await sodium.ready;
  const input = `${userId}:${authCredential}`;
  return blake3(new TextEncoder().encode(input), { dkLen: 32 });
}

// Example: Wallet-based auth
const walletAddress = "0x1234...";
const signature = await signMessage(walletAddress, "zkim-auth");
const userId = walletAddress;
const userKey = await deriveUserKey(userId, signature);

// Example: OAuth-based auth
const googleUser = await googleAuth.signIn();
const userId = googleUser.sub; // or googleUser.email
const userKey = await deriveUserKey(userId, googleUser.idToken);

// Example: Email/password auth (use Argon2id for passwords)
const userId = userEmail;
const salt = await getOrCreateSalt(userId);
const userKey = await argon2id.deriveKey(password, salt, { iterations: 100000 });
```

### Store Keys Securely

**⚠️ IMPORTANT:** Never store keys in plaintext. Use secure key management:

```typescript
// Option 1: Key Management Service (recommended for production)
// - AWS KMS, Azure Key Vault, Google Cloud KMS
// - Hardware Security Modules (HSM)
// - Dedicated key management services

// Option 2: Encrypted storage (browser)
// Use encrypted storage with user-specific encryption
await SecureStorage.initialize(userId);
await SecureStorage.setItem("platformKey", encryptedPlatformKey);
```

### Authentication Integration

For complete authentication integration guide, see **[Authentication Integration](Authentication-Integration.md)** which covers:
- Wallet-based authentication (Ethereum, Web3)
- OAuth providers (Google, Auth0, etc.)
- Email/password authentication
- JWT/session-based authentication
- Key derivation strategies
- Security best practices

---

## File Operations

### Create File

```typescript
const result = await fileService.createZkimFile(
  data: Uint8Array,
  userId: string,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  metadata: {
    fileName: string;
    mimeType: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  }
);
```

### Download File

```typescript
const result = await fileService.downloadFile(
  fileId: string,
  userId: string,
  platformKey: Uint8Array,
  userKey: Uint8Array
);
```

### Search Files

```typescript
const result = await fileService.searchFiles(
  query: string,
  userId: string,
  limit?: number
);
```

### Validate Integrity

```typescript
const result = await fileService.validateFileIntegrity(
  file: ZkimFile
);
```

---

## Error Handling

Operations throw `ServiceError` on failure. Use try/catch for error handling:

```typescript
try {
  const result = await fileService.createZkimFile(...);
  
  // On success, result contains the file
  if (result.success && result.file) {
    console.log("File created:", result.file.header.fileId);
  }
} catch (error) {
  if (error instanceof ServiceError) {
    console.error("Service error:", error.code, error.message);
    console.error("Details:", error.details);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

---

## Next Steps

1. **Read [Authentication Integration](Authentication-Integration.md)** ⭐ **CRITICAL** - How to integrate with your auth system
2. **Read [Storage Integration](Storage-Integration.md)** - Essential for production use
3. **Check [Examples](Examples.md)** - Real-world usage patterns
4. **Review [API Reference](API-Reference.md)** - Complete method documentation
5. **See [Security](Security.md)** - Cryptographic details and best practices

---

## Common Patterns

### Initialize Once, Use Many Times

```typescript
// Initialize once
const fileService = new ZKIMFileService(config, logger, storage);
await fileService.initialize();

// Use for multiple operations
await fileService.createZkimFile(...);
await fileService.downloadFile(...);
await fileService.searchFiles(...);

// Cleanup when done
await fileService.cleanup();
```

### Error Handling Pattern

```typescript
try {
  const result = await fileService.createZkimFile(...);
  
  // On success, use result.file
  if (result.success && result.file) {
    console.log("File created:", result.file.header.fileId);
  }
} catch (error) {
  if (error instanceof ServiceError) {
    console.error("Service error:", error.code, error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

---

**Last Updated:** 2026-01-09

