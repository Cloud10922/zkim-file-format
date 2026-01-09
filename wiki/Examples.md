# Examples

Real-world code examples and integration patterns for `@zkim-platform/file-format`.

---

## Basic Usage

### Create and Download a File

```typescript
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

async function basicExample() {
  await sodium.ready;

  // Generate keys
  const platformKey = sodium.randombytes_buf(32);
  const userKey = sodium.randombytes_buf(32);
  const userId = "user-123";

  // Create storage and service
  const storage = new InMemoryStorage();
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

  // Create file
  const data = new TextEncoder().encode("Hello, ZKIM!");
  const createResult = await fileService.createZkimFile(
    data,
    userId,
    platformKey,
    userKey,
    {
      fileName: "hello.txt",
      mimeType: "text/plain",
    }
  );

  if (!createResult.success || !createResult.file) {
    throw new Error("Failed to create file");
  }

  const fileId = createResult.file.header.fileId;

  // Download file (requires platformKey and userKey for decryption)
  const downloadResult = await fileService.downloadFile(fileId, userId, platformKey, userKey);
  if (downloadResult.success && downloadResult.data) {
    const text = new TextDecoder().decode(downloadResult.data);
    console.log("Downloaded:", text);
  }

  await fileService.cleanup();
}
```

---

## Storage Integration Examples

### AWS S3 Integration

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { S3StorageBackend } from "./storage/s3-storage-backend";

const s3Storage = new S3StorageBackend(
  "my-bucket",
  "us-east-1",
  process.env.AWS_ACCESS_KEY_ID!,
  process.env.AWS_SECRET_ACCESS_KEY!,
  "zkim-files/"
);

const fileService = new ZKIMFileService(
  {
    enableCompression: true,
    enableSearchableEncryption: true,
  },
  undefined,
  s3Storage
);

await fileService.initialize();
// Use fileService...
```

### Azure Blob Storage Integration

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { AzureBlobStorageBackend } from "./storage/azure-storage-backend";

const azureStorage = new AzureBlobStorageBackend(
  process.env.AZURE_CONNECTION_STRING!,
  "zkim-container",
  "zkim-files/"
);

const fileService = new ZKIMFileService(
  {
    enableCompression: true,
  },
  undefined,
  azureStorage
);

await fileService.initialize();
```

### Google Cloud Storage Integration

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { GCSStorageBackend } from "./storage/gcs-storage-backend";

const gcsStorage = new GCSStorageBackend(
  "my-bucket",
  process.env.GCS_KEY_FILENAME,
  "zkim-files/"
);

const fileService = new ZKIMFileService(
  {
    enableCompression: true,
  },
  undefined,
  gcsStorage
);

await fileService.initialize();
```

---

## Search Examples

### Basic Search

```typescript
// Enable searchable encryption
const fileService = new ZKIMFileService({
  enableSearchableEncryption: true,
});

await fileService.initialize();

// Create files with searchable content
await fileService.createZkimFile(
  new TextEncoder().encode("Document about cryptography"),
  userId,
  platformKey,
  userKey,
  {
    fileName: "crypto-doc.txt",
    mimeType: "text/plain",
    tags: ["cryptography", "security"],
  }
);

// Search files
const searchResult = await fileService.searchFiles("cryptography", userId, 10);
console.log(`Found ${searchResult.totalResults} files`);
for (const result of searchResult.results) {
  console.log(`- ${result.metadata.fileName}`);
}
```

### Advanced Search with Filters

```typescript
// Search with custom query
const searchResult = await fileService.searchFiles("example", userId, 50);

// Filter results by metadata
const filteredResults = searchResult.results.filter(
  result => result.metadata.tags?.includes("important")
);

console.log(`Found ${filteredResults.length} important files`);
```

---

## Error Handling Examples

### Comprehensive Error Handling

```typescript
import { ServiceError } from "@zkim-platform/file-format";

async function handleErrors() {
  try {
    const result = await fileService.createZkimFile(...);
    
    // On success, use result.file
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
}
```

### Retry Logic

```typescript
async function createFileWithRetry(
  data: Uint8Array,
  userId: string,
  platformKey: Uint8Array,
  userKey: Uint8Array,
  metadata: Partial<ZkimFileMetadata>,
  maxRetries = 3
): Promise<ZkimFileResult> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fileService.createZkimFile(
        data,
        userId,
        platformKey,
        userKey,
        metadata
      );
      if (result.success) {
        return result;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}
```

---

## Integrity Validation Examples

### Validate File Integrity

```typescript
// Get file
const fileResult = await fileService.getZkimFile(fileId);
if (!fileResult.success || !fileResult.data) {
  throw new Error("File not found");
}

const file = fileResult.data;

// Validate integrity (keys are retrieved internally if needed)
const validation = await fileService.validateFileIntegrity(file);

if (!validation.isValid) {
  console.error("File integrity check failed!");
  console.error("Errors:", validation.errors);
  console.error("Warnings:", validation.warnings);
} else {
  console.log("File integrity validated successfully");
  console.log("Validation level:", validation.validationLevel);
}
```

### Batch Validation

```typescript
async function validateAllFiles(fileIds: string[]) {
  const results = await Promise.all(
    fileIds.map(async (fileId) => {
      const fileResult = await fileService.getZkimFile(fileId);
      if (!fileResult.success || !fileResult.data) {
        return { fileId, valid: false, error: "File not found" };
      }

      // Validate integrity (keys retrieved internally)
      const validation = await fileService.validateFileIntegrity(
        fileResult.data
      );
      return {
        fileId,
        valid: validation.isValid,
        errors: validation.errors,
      };
    })
  );

  const invalidFiles = results.filter(r => !r.valid);
  console.log(`Found ${invalidFiles.length} invalid files`);
}
```

---

## Compression Examples

### Custom Compression Configuration

```typescript
const fileService = new ZKIMFileService({
  enableCompression: true,
  compressionLevel: 9,              // Maximum compression
  compressionAlgorithm: "brotli",   // Use Brotli instead of GZIP
  chunkSize: 1024 * 1024,          // 1MB chunks
});

await fileService.initialize();
```

### Compression Disabled

```typescript
const fileService = new ZKIMFileService({
  enableCompression: false,  // Disable compression
});

await fileService.initialize();
```

---

## Key Management Examples

**⚠️ IMPORTANT:** For complete authentication integration guide, see **[Authentication Integration](Authentication-Integration.md)** which covers:
- Wallet-based authentication
- OAuth providers (Google, Auth0, etc.)
- Email/password authentication
- Key derivation strategies
- Security best practices

### Secure Key Storage (Browser)

```typescript
import { fromBase64 } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";
import { blake3 } from "@noble/hashes/blake3.js";

// Example: Key derivation and storage
// ⚠️ WARNING: This is a simplified example. For production, derive keys from
// actual user authentication. See Authentication Integration guide.

async function manageKeys(userId: string, authCredential: string) {
  await sodium.ready;

  // Platform key (store securely, same for all users)
  const platformKey = sodium.randombytes_buf(32);
  
  // User key - DERIVE from authentication, don't generate randomly!
  // Example: const userKey = await deriveKeyFromWallet(walletAddress, signature);
  const userKey = await blake3(
    new TextEncoder().encode(`${userId}:${authCredential}`),
    { dkLen: 32 }
  );

  // Store keys (in production, encrypt these before storing)
  // This example uses localStorage - implement proper encryption for production
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(
      `zkim-platformKey-${userId}`,
      sodium.to_base64(platformKey)
    );
    localStorage.setItem(
      `zkim-userKey-${userId}`,
      sodium.to_base64(userKey)
    );
  }

  // Retrieve keys
  const storedPlatformKeyBase64 = localStorage.getItem(`zkim-platformKey-${userId}`);
  const storedUserKeyBase64 = localStorage.getItem(`zkim-userKey-${userId}`);

  if (!storedPlatformKeyBase64 || !storedUserKeyBase64) {
    throw new Error("Keys not found in storage");
  }

  const storedPlatformKey = fromBase64(storedPlatformKeyBase64);
  const storedUserKey = fromBase64(storedUserKeyBase64);

  return { platformKey: storedPlatformKey, userKey: storedUserKey };
}

// For production, use a proper key management service:
// - AWS KMS, Azure Key Vault, Google Cloud KMS
// - Hardware Security Modules (HSM)
// - Dedicated key management services
```

### Key Rotation

```typescript
async function rotateKeys(
  userId: string,
  platformKey: Uint8Array,
  oldUserKey: Uint8Array,
  newUserKey: Uint8Array,
  storage: IStorageBackend
) {
  // Get all files from storage
  const keys = await storage.keys();

  // Re-encrypt all files with new key
  for (const fileId of keys) {
    try {
      const fileResult = await fileService.getZkimFile(fileId);
      if (!fileResult.success || !fileResult.data) continue;

      // Decrypt file using the previous user key (before rotation)
      const downloadResult = await fileService.downloadFile(
        fileId,
        userId,
        platformKey,
        oldUserKey // Previous key used to encrypt this file
      );
      if (!downloadResult.success || !downloadResult.data) continue;

      // Re-create with new key
      await fileService.createZkimFile(
        downloadResult.data,
        userId,
        platformKey,
        newUserKey,
        fileResult.data.metadata
      );
    } catch (error) {
      console.error(`Failed to rotate key for file ${fileId}:`, error);
    }
  }
}
```

---

## Performance Optimization Examples

### Large File Handling

```typescript
// Configure for large files
const fileService = new ZKIMFileService({
  chunkSize: 1024 * 1024,        // 1MB chunks
  maxFileSize: 100 * 1024 * 1024 * 1024, // 100GB max
  enableStreaming: true,
});

await fileService.initialize();

// Process large file in chunks
const largeFile = await readLargeFile("large-file.bin");
const result = await fileService.createZkimFile(
  largeFile,
  userId,
  platformKey,
  userKey,
  {
    fileName: "large-file.bin",
    mimeType: "application/octet-stream",
  }
);
```

### Batch Operations

```typescript
async function createMultipleFiles(
  files: Array<{ data: Uint8Array; metadata: Partial<ZkimFileMetadata> }>
) {
  const results = await Promise.all(
    files.map(file =>
      fileService.createZkimFile(
        file.data,
        userId,
        platformKey,
        userKey,
        file.metadata
      )
    )
  );

  const successful = results.filter(r => r.success);
  console.log(`Created ${successful.length}/${files.length} files`);
}
```

---

## Integration Patterns

### Express.js API Integration

```typescript
import express from "express";
import { ZKIMFileService } from "@zkim-platform/file-format";
import { S3StorageBackend } from "./storage/s3-storage-backend";

const app = express();
const fileService = new ZKIMFileService(
  config,
  logger,
  new S3StorageBackend(...)
);

await fileService.initialize();

app.post("/api/files", async (req, res) => {
  try {
    const { data, userId, metadata } = req.body;
    const result = await fileService.createZkimFile(
      new TextEncoder().encode(data),
      userId,
      platformKey,
      userKey,
      metadata
    );

    if (result.success) {
      res.json({ fileId: result.file?.header.fileId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/files/:fileId", async (req, res) => {
  try {
    // Get user authentication and derive keys
    const userId = req.query.userId as string;
    const userKey = await deriveUserKey(userId, req.headers.authorization);
    
    const result = await fileService.downloadFile(
      req.params.fileId,
      userId,
      platformKey,
      userKey
    );

    if (result.success && result.data) {
      res.send(result.data);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Next.js API Route

```typescript
// pages/api/files/upload.ts
import { ZKIMFileService } from "@zkim-platform/file-format";
import { S3StorageBackend } from "../../lib/storage/s3-storage-backend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fileService = new ZKIMFileService(
    config,
    undefined,
    new S3StorageBackend(...)
  );

  await fileService.initialize();

  const result = await fileService.createZkimFile(
    req.body.data,
    req.body.userId,
    platformKey,
    userKey,
    req.body.metadata
  );

  res.json(result);
}
```

---

## Advanced Examples

### Custom Storage with Caching

```typescript
class CachedStorageBackend implements IStorageBackend {
  private cache = new Map<string, { data: Uint8Array; timestamp: number }>();
  private ttl: number;

  constructor(
    private backend: IStorageBackend,
    ttl = 60000
  ) {
    this.ttl = ttl;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }

    const data = await this.backend.get(key);
    if (data) {
      this.cache.set(key, { data, timestamp: Date.now() });
    }
    return data;
  }

  // Implement other methods...
}

// Usage
const cachedStorage = new CachedStorageBackend(
  new S3StorageBackend(...),
  60000  // 1 minute TTL
);
```

### Monitoring and Metrics

```typescript
class MonitoredStorageBackend implements IStorageBackend {
  private metrics = {
    getCount: 0,
    setCount: 0,
    errorCount: 0,
  };

  constructor(private backend: IStorageBackend) {}

  async get(key: string): Promise<Uint8Array | null> {
    try {
      this.metrics.getCount++;
      const result = await this.backend.get(key);
      return result;
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  // Implement other methods...
}
```

---

## See Also

- **[Getting Started](Getting-Started.md)** - Installation and basic setup
- **[Authentication Integration](Authentication-Integration.md)** ⭐ - Connect your authentication system
- **[Storage Integration](Storage-Integration.md)** - Complete storage backend guide
- **[API Reference](API-Reference.md)** - Full API documentation
- **[Security](Security.md)** - Security best practices

---

**Last Updated:** 2026-01-09

