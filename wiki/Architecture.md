# Architecture

Architecture and file format specification for `@zkim-platform/file-format`.

---

## File Format Overview

The ZKIM file format is **post-quantum secure** using NIST-standardized algorithms:

- **Magic Bytes:** `"ZKIM"` (4 bytes)
- **Version:** `1` (2 bytes)
- **Algorithm Suite ID:** `0x01` (ML-KEM-768 + XChaCha20-Poly1305 + ML-DSA-65 + BLAKE3)
- **Key Exchange:** ML-KEM-768 (FIPS 203) - 1,088 byte ciphertext
- **Signature:** ML-DSA-65 (FIPS 204) - 3,309 byte signatures
- **Encryption:** XChaCha20-Poly1305 (platform/user layers use ML-KEM-768 derived keys, content layer uses random keys)
- **Hashing:** BLAKE3 (256-bit)

### File Structure

```
ZKIM File
├── Header (ZkimFileHeader)
├── Chunks (ZkimFileChunk[])
├── Metadata (ZkimFileMetadata)
├── Platform Signature (3,309 bytes)
├── User Signature (3,309 bytes)
└── Content Signature (3,309 bytes)
```

---

## Header Structure

### ZkimFileHeader

```typescript
interface ZkimFileHeader {
  magic: "ZKIM";           // 4 bytes - Magic bytes
  version: 1;              // 2 bytes - Version number
  flags: number;           // 2 bytes - Feature flags
  platformKeyId: string;   // Platform key identifier
  userId: string;          // User identifier
  fileId: string;          // File identifier
  createdAt: number;       // Creation timestamp
  chunkCount: number;      // Number of chunks
  totalSize: number;       // Total file size
  compressionType: number; // Compression type (0=none, 1=brotli, 2=gzip)
  encryptionType: number;  // Encryption type (1=single, 2=three-layer)
  hashType: number;        // Hash type (1=BLAKE3)
  signatureType: 1;        // Signature type (1=ML-DSA-65, FIPS 204)
}
```

### Magic Bytes

- **"ZKIM"** - Magic bytes identifier

### Version Numbers

- **1** - Format version (uses ML-DSA-65, FIPS 204)

### Signature Types

- **1** - ML-DSA-65 (3,309 bytes, FIPS 204)

---

## Chunk Structure

### ZkimFileChunk

```typescript
interface ZkimFileChunk {
  chunkIndex: number;       // Chunk index (0-based)
  chunkSize: number;        // Original chunk size
  compressedSize: number;   // Compressed size
  encryptedSize: number;    // Encrypted size
  nonce: Uint8Array;        // Encryption nonce (24 bytes)
  encryptedData: Uint8Array; // Encrypted chunk data
  integrityHash: Uint8Array;  // BLAKE3 hash (32 bytes)
  padding: Uint8Array;       // Padding bytes
}
```

### Chunking Strategy

- **Default Chunk Size:** 512 KB (524,288 bytes)
- **Max Chunk Size:** 1 MB (1,048,576 bytes)
- **Min Chunk Size:** 1 KB (1,024 bytes)

Large files are automatically split into chunks for:
- Efficient processing
- Parallel encryption/decryption
- Streaming support
- Error recovery

---

## Three-Layer Encryption

The ZKIM file format uses **ML-KEM-768 key derivation** for platform and user encryption layers. Platform and user layer keys are derived from ML-KEM-768 shared secrets using BLAKE3, providing post-quantum security. Content layer keys are cryptographically random for per-file perfect forward secrecy.

### ML-KEM-768 Key Derivation Pattern

Platform and user layer encryption keys are derived using the following pattern:

1. **Generate ML-KEM-768 key pair** for key exchange
2. **Encapsulate shared secret** to recipient's public key (or self-encapsulation for self-encryption)
3. **Derive encryption key** using BLAKE3 from shared secret (combined with platform/user keys)
4. **Encrypt data** with XChaCha20-Poly1305 using the derived key

This ensures platform and user layer encryption operations use post-quantum secure key derivation. Content layer keys are randomly generated per file for perfect forward secrecy.

### Layer 1: Content Encryption

**Purpose:** Encrypt file content with content key

**Algorithm:** XChaCha20-Poly1305

**Key:** Cryptographically random (32 bytes, per-file perfect forward secrecy)

**Nonce:** Content nonce (24 bytes, random)

**Result:** Content-encrypted data

**Note:** Content keys are randomly generated per file using `sodium.randombytes_buf(32)`, not derived from ML-KEM-768. This provides perfect forward secrecy - each file has an independent encryption key.

### Layer 2: User Encryption

**Purpose:** Encrypt content key and metadata with user key

**Algorithm:** XChaCha20-Poly1305

**Key Derivation:** ML-KEM-768 shared secret + user key → BLAKE3 → 32-byte key

**Nonce:** User nonce (24 bytes, random)

**Result:** User-encrypted data (contains content key)

### Layer 3: Platform Encryption

**Purpose:** Encrypt user layer with platform key

**Algorithm:** XChaCha20-Poly1305

**Key Derivation:** ML-KEM-768 shared secret + platform key → BLAKE3 → 32-byte key

**Nonce:** Platform nonce (24 bytes, random)

**Result:** Platform-encrypted data

### Encryption Flow Diagram

```
Original Data
    ↓
[Compression] (optional)
    ↓
Content Key Generation (random, 32 bytes)
    ↓
Content Encryption (XChaCha20-Poly1305 with random content key)
    ↓
ML-KEM-768 Key Exchange → Shared Secret
    ↓
BLAKE3 Key Derivation (sharedSecret + userKey)
    ↓
User Encryption (XChaCha20-Poly1305 with derived key, encrypts content key)
    ↓
ML-KEM-768 Key Exchange → Shared Secret
    ↓
BLAKE3 Key Derivation (sharedSecret + platformKey)
    ↓
Platform Encryption (XChaCha20-Poly1305 with derived key)
    ↓
ZKIM File Format (includes KEM ciphertext in wire format)
```

---

## Wire Format

### Binary Structure

The wire format is a binary representation of the ZKIM file with ML-KEM-768 key exchange:

```
[Magic Bytes: 4 bytes]
[Version: 2 bytes]
[Flags: 2 bytes]
[Header Fields: variable]
[KEM Ciphertext: 1,088 bytes]  ← ML-KEM-768 ciphertext for key exchange
[EH_PLATFORM: 40 bytes]       ← Encrypted with ML-KEM-768 derived key
[EH_USER: 40 bytes]           ← Encrypted with ML-KEM-768 derived key
[Chunks: variable]            ← Encrypted with random content keys (per-file perfect forward secrecy)
[Merkle Root: 32 bytes]      ← BLAKE3 hash
[File Signature: 3,309 bytes] ← ML-DSA-65 signature
```

**Key Components:**
- **KEM Ciphertext (1,088 bytes)**: ML-KEM-768 ciphertext used to derive shared secret for platform/user layer encryption
- **EH Headers**: Encrypted headers using keys derived from ML-KEM-768 shared secrets (platform/user layers)
- **Chunks**: Encrypted content using randomly generated content keys (per-file perfect forward secrecy)

### EH Header Format

**EH_PLATFORM and EH_USER** headers contain:
- Nonce (24 bytes)
- Authentication tag (16 bytes)

**Total Size:** 40 bytes per EH header

### Merkle Root

All chunks are hashed and organized in a Merkle tree:

```typescript
const merkleRoot = calculateMerkleRoot(chunks);
```

**Size:** 32 bytes (BLAKE3 hash)

### File Signature

The file is signed with ML-DSA-65:

```typescript
const fileSignature = await generateFileSignature(
  merkleRoot,
  manifestHash,
  algSuiteId,
  version,
  userKey
);
```

**Size:** 3,309 bytes (ML-DSA-65 signature)

---

## Integrity Validation

### BLAKE3 Hashing

Each chunk is hashed using BLAKE3:

```typescript
const chunkHash = blake3(chunkData, { dkLen: 32 });
```

**Hash Size:** 32 bytes (256 bits)

### Merkle Tree

Chunks are organized in a Merkle tree:

```
        Root
       /    \
    Hash1   Hash2
   /  \    /  \
  C1  C2  C3  C4
```

**Benefits:**
- Efficient integrity validation
- Parallel hash computation
- Partial validation support

### Signature Validation

Three signatures validate different layers:

1. **Platform Signature:** Validates platform-layer integrity
2. **User Signature:** Validates user-layer integrity
3. **Content Signature:** Validates content-layer integrity

**Algorithm:** ML-DSA-65 (FIPS 204)

**Signature Size:** 3,309 bytes per signature

---

## Compression

### Supported Algorithms

- **None (0):** No compression
- **Brotli (1):** Brotli compression
- **GZIP (2):** GZIP compression (default)

### Compression Flow

```
Original Data
    ↓
[Compression] (optional)
    ↓
Encryption
    ↓
ZKIM File Format
```

### Compression Configuration

```typescript
{
  enableCompression: true,
  compressionLevel: 6,        // 1-9
  compressionAlgorithm: "gzip" // "gzip" | "brotli"
}
```

---

## Searchable Encryption

### OPRF-Based Search

Privacy-preserving search uses OPRF (Oblivious Pseudorandom Function):

1. **Indexing:** Files are indexed with trapdoors
2. **Querying:** Search queries generate trapdoors
3. **Matching:** Trapdoors are matched without revealing content

### Trapdoor Rotation

Trapdoors are rotated periodically for security:

- **Rotation Interval:** Configurable (default: 7 days)
- **Rotation Strategy:** Automatic or manual
- **Backward Compatibility:** Old trapdoors remain valid during grace period

---

## Error Recovery

### Corruption Detection

The system detects:
- Corrupted chunks
- Invalid signatures
- Tampered metadata
- Missing data

### Recovery Strategies

1. **Chunk Recovery:** Recover from backup chunks
2. **Signature Revalidation:** Re-validate signatures
3. **Metadata Repair:** Repair corrupted metadata
4. **Partial Recovery:** Recover valid chunks only

---

## Performance Optimization

### Chunking

Large files are chunked for:
- Parallel processing
- Streaming support
- Error recovery
- Memory efficiency

### Caching

Frequently accessed files are cached:
- In-memory cache
- Storage-level cache
- Metadata cache

### Streaming

Large files support streaming:
- Chunk-by-chunk processing
- Memory-efficient operations
- Progressive loading

---

## Storage Integration

### IStorageBackend Interface

All storage backends implement:

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

### Storage Agnostic

The file format works with any storage:
- Cloud storage (S3, Azure, GCS)
- IPFS
- Databases
- Local filesystem
- Custom backends

See **[Storage Integration](Storage-Integration.md)** for details.

---

## See Also

- **[Security](Security.md)** - Security documentation
- **[Storage Integration](Storage-Integration.md)** - Storage backend guide
- **[API Reference](API-Reference.md)** - Complete API documentation

---

**Last Updated:** 2026-01-09

