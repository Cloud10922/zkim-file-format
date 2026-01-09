# Troubleshooting

Common issues, error codes, and solutions for `@zkim-platform/file-format`.

---

## Common Issues

### File Creation Fails

**Error:** `"ZKIM file creation failed"`

**Possible Causes:**
1. Invalid encryption keys
2. Storage backend not configured
3. File size exceeds maximum
4. Compression failure

**Solutions:**
```typescript
// Check keys are 32 bytes
if (platformKey.length !== 32 || userKey.length !== 32) {
  throw new Error("Keys must be 32 bytes");
}

// Ensure storage is configured
if (!storageService) {
  throw new Error("Storage service required");
}

// Check file size
if (data.length > config.maxFileSize) {
  throw new Error("File too large");
}

// Disable compression if causing issues
const fileService = new ZKIMFileService({
  enableCompression: false,
});
```

### File Download Fails

**Error:** `"ZKIM file decryption failed"`

**Possible Causes:**
1. Wrong encryption keys
2. File not found in storage
3. Corrupted file data
4. Missing content key

**Solutions:**
```typescript
// Verify file exists and can be downloaded
try {
  const result = await fileService.downloadFile(fileId, userId, platformKey, userKey);
  if (result.success && result.data) {
    // File downloaded successfully
  }
} catch (error) {
  if (error instanceof ServiceError) {
    console.error("Service error:", error.code, error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}

// Check file exists
const fileResult = await fileService.getZkimFile(fileId);
if (!fileResult.success) {
  console.error("File not found");
}

// Validate file integrity
const validation = await fileService.validateFileIntegrity(file);
if (!validation.isValid) {
  console.error("File corrupted:", validation.errors);
}
```

### Search Returns No Results

**Error:** `"No files found"` or `totalResults: 0`

**Possible Causes:**
1. Searchable encryption not enabled
2. Files not indexed
3. Query doesn't match indexed content

**Solutions:**
```typescript
// Enable searchable encryption
const fileService = new ZKIMFileService({
  enableSearchableEncryption: true,
});

// Ensure files are indexed when created
// Files are automatically indexed if searchable encryption is enabled

// Check search query
const result = await fileService.searchFiles("query", userId);
console.log("Results:", result.totalResults);
```

### Integrity Validation Fails

**Error:** `"File integrity validation failed"`

**Possible Causes:**
1. File corrupted
2. Invalid signatures
3. Tampered data
4. Wrong keys for validation

**Solutions:**
```typescript
// Validate file integrity
const validation = await fileService.validateFileIntegrity(file);

if (!validation.isValid) {
  console.error("Validation errors:", validation.errors);
  console.error("Warnings:", validation.warnings);
  
  // Check specific validation results
  if (!validation.headerValid) {
    console.error("Header validation failed");
  }
  if (!validation.chunksValid) {
    console.error("Chunks validation failed");
  }
  if (!validation.signaturesValid) {
    console.error("Signatures validation failed");
  }
}
```

### Storage Backend Errors

**Error:** `"Storage operation failed"`

**Possible Causes:**
1. Storage backend not configured
2. Network issues
3. Authentication failures
4. Permission issues

**Solutions:**
```typescript
// Check storage backend is configured
if (!storageService) {
  throw new Error("Storage service required");
}

// Implement retry logic
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

// Use with storage operations
const data = await withRetry(() => storageService.get(key));
```

---

## Error Codes

### File Operation Errors

| Code | Description | Solution |
|------|-------------|----------|
| `FILE_SIZE_EXCEEDED` | File exceeds maximum size | Reduce file size or increase `maxFileSize` |
| `FILE_NOT_FOUND` | File not found in storage | Verify file ID and storage backend |
| `FILE_CREATION_FAILED` | File creation failed | Check keys, storage, and configuration |
| `FILE_DECRYPTION_FAILED` | File decryption failed | Verify keys match and file is not corrupted |

### Encryption Errors

| Code | Description | Solution |
|------|-------------|----------|
| `ENCRYPTION_FAILED` | Encryption operation failed | Check keys are 32 bytes and valid |
| `DECRYPTION_FAILED` | Decryption operation failed | Verify keys match and data is not corrupted |
| `KEY_GENERATION_FAILED` | Key generation failed | Check random number generator |

### Integrity Errors

| Code | Description | Solution |
|------|-------------|----------|
| `INTEGRITY_VALIDATION_FAILED` | Integrity validation failed | File may be corrupted or tampered |
| `SIGNATURE_VALIDATION_FAILED` | Signature validation failed | Verify keys and check for tampering |
| `CHUNK_VALIDATION_FAILED` | Chunk validation failed | File chunks may be corrupted |

### Storage Errors

| Code | Description | Solution |
|------|-------------|----------|
| `STORAGE_NOT_AVAILABLE` | Storage service not available | Configure storage backend |
| `STORAGE_ERROR` | Storage operation failed | Check storage backend and network |
| `STORAGE_PERMISSION_DENIED` | Storage permission denied | Check storage credentials and permissions |

### Search Errors

| Code | Description | Solution |
|------|-------------|----------|
| `SEARCHABLE_ENCRYPTION_DISABLED` | Searchable encryption not enabled | Enable `enableSearchableEncryption` |
| `FILE_SEARCH_FAILED` | File search failed | Check search query and indexed files |
| `FILE_SEARCH_DATA_MISSING` | Search result data missing | Verify search service is working |

---

## Performance Issues

### Slow File Creation

**Possible Causes:**
1. Large file size
2. Compression enabled
3. Slow storage backend
4. High compression level

**Solutions:**
```typescript
// Increase chunk size for large files
const fileService = new ZKIMFileService({
  chunkSize: 1024 * 1024, // 1MB chunks
});

// Disable compression for speed
const fileService = new ZKIMFileService({
  enableCompression: false,
});

// Use lower compression level
const fileService = new ZKIMFileService({
  compressionLevel: 1, // Faster, less compression
});
```

### Slow File Download

**Possible Causes:**
1. Large file size
2. Slow storage backend
3. Network latency
4. Integrity validation overhead

**Solutions:**
```typescript
// Disable integrity validation for speed (not recommended)
const fileService = new ZKIMFileService({
  enableIntegrityValidation: false,
});

// Use caching
const cachedStorage = new CachedStorageBackend(storage, 60000);
```

### High Memory Usage

**Possible Causes:**
1. Large files loaded into memory
2. Multiple files in memory
3. Compression buffers

**Solutions:**
```typescript
// Use streaming for large files
const fileService = new ZKIMFileService({
  enableStreaming: true,
});

// Process files in batches
const files = await storage.keys();
for (const fileId of files) {
  const result = await fileService.downloadFile(fileId, userId, platformKey, userKey);
  // Process and release memory
}
```

---

## Configuration Issues

### Compression Not Working

**Error:** `"Compression failed"` or compression disabled

**Possible Causes:**
1. pako library not available (Node.js)
2. Compression disabled in config
3. Data not compressible

**Solutions:**
```typescript
// Install pako for Node.js
npm install pako

// Enable compression
const fileService = new ZKIMFileService({
  enableCompression: true,
  compressionAlgorithm: "gzip",
});

// Check if compression is beneficial
const originalSize = data.length;
const compressed = await compressGzip(data);
if (compressed.length >= originalSize) {
  // Compression not beneficial, disable
}
```

### Searchable Encryption Not Working

**Error:** `"Searchable encryption is not enabled"`

**Solutions:**
```typescript
// Enable searchable encryption
const fileService = new ZKIMFileService({
  enableSearchableEncryption: true,
});

// Ensure files are indexed
// Files are automatically indexed when created with searchable encryption enabled
```

---

## Browser-Specific Issues

### localStorage Not Available

**Error:** `"localStorage is not available"`

**Solutions:**
```typescript
// Check if localStorage is available
if (typeof window === "undefined" || !window.localStorage) {
  // Use InMemoryStorage instead
  const storage = new InMemoryStorage();
}

// Or use custom storage backend
const storage = new CustomStorageBackend();
```

### CORS Issues

**Error:** CORS errors when accessing storage

**Solutions:**
```typescript
// Configure CORS on storage backend
// For S3, configure CORS policy
// For REST API, configure CORS headers
```

---

## Node.js-Specific Issues

### pako Not Available

**Error:** `"Cannot find module 'pako'"`

**Solutions:**
```bash
npm install pako
```

### libsodium Not Ready

**Error:** `"libsodium not ready"`

**Solutions:**
```typescript
// Always wait for libsodium to be ready
await sodium.ready;

// Then use libsodium functions
const key = sodium.randombytes_buf(32);
```

---

## Debugging Tips

### Enable Debug Logging

```typescript
import { ConsoleLogger } from "@zkim-platform/file-format";

const logger = new ConsoleLogger();
logger.setLevel("debug");

const fileService = new ZKIMFileService(config, logger, storage);
```

### Check File Structure

```typescript
const fileResult = await fileService.getZkimFile(fileId);
if (fileResult.success && fileResult.data) {
  const file = fileResult.data;
  console.log("Header:", file.header);
  console.log("Chunks:", file.chunks.length);
  console.log("Metadata:", file.metadata);
}
```

### Validate File Integrity

```typescript
const validation = await fileService.validateFileIntegrity(file);
console.log("Validation:", {
  isValid: validation.isValid,
  errors: validation.errors,
  warnings: validation.warnings,
});
```

---

## Getting Help

### Resources

- **[API Reference](API-Reference)** - Complete API documentation
- **[Examples](Examples)** - Code examples
- **[Storage Integration](Storage-Integration)** - Storage backend guide
- **[GitHub Issues](https://github.com/zkdotim/zkim-file-format/issues)** - Report bugs

### Reporting Issues

When reporting issues, include:
1. Error message and code
2. Steps to reproduce
3. Configuration used
4. Environment (Node.js version, browser, etc.)
5. Stack trace (if available)

---

---

## Common Pitfalls

### ❌ Using Random Keys in Production

**Problem:** Using `sodium.randombytes_buf(32)` for user keys in production.

```typescript
// ❌ WRONG: Random keys won't work for decryption
const userKey = sodium.randombytes_buf(32);
const result = await fileService.createZkimFile(data, userId, platformKey, userKey);

// Later, user can't decrypt because key is different
const decrypted = await fileService.decryptZkimFile(file, userId, userKey); // ❌ Different key!
```

**Solution:** Always derive keys from actual user authentication.

```typescript
// ✅ CORRECT: Derive key from authentication
const userKey = await deriveKeyFromWallet(walletAddress, signature);
const result = await fileService.createZkimFile(data, userId, platformKey, userKey);

// Later, same user with same auth = same key
const userKey2 = await deriveKeyFromWallet(walletAddress, signature); // ✅ Same key
const decrypted = await fileService.decryptZkimFile(file, userId, userKey2); // ✅ Works!
```

**See:** [Authentication Integration](Authentication-Integration) for proper key derivation.

---

### ❌ Forgetting to Call `initialize()`

**Problem:** Using service before initialization.

```typescript
// ❌ WRONG: Service not initialized
const fileService = new ZKIMFileService({}, undefined, storage);
const result = await fileService.createZkimFile(...); // ❌ Error: Service not initialized
```

**Solution:** Always call `initialize()` before using the service.

```typescript
// ✅ CORRECT: Initialize before use
const fileService = new ZKIMFileService({}, undefined, storage);
await fileService.initialize(); // ✅ Required
const result = await fileService.createZkimFile(...); // ✅ Works
```

---

### ❌ Not Handling Async Errors

**Problem:** Not wrapping async operations in try/catch.

```typescript
// ❌ WRONG: Errors not handled
const result = await fileService.createZkimFile(data, userId, platformKey, userKey);
if (result.success) {
  // Handle success
}
// ❌ What if result.success is false? Error not handled
```

**Solution:** Always use try/catch for error handling.

```typescript
// ✅ CORRECT: Proper error handling
try {
  const result = await fileService.createZkimFile(data, userId, platformKey, userKey);
  if (result.success && result.file) {
    // Handle success
  } else {
    console.error("File creation failed:", result.error);
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

### ❌ Storing Keys in Plaintext

**Problem:** Storing encryption keys in plaintext (localStorage, database, etc.).

```typescript
// ❌ WRONG: Plaintext key storage
localStorage.setItem("userKey", sodium.to_base64(userKey));
const storedKey = localStorage.getItem("userKey"); // ❌ Anyone can read this
```

**Solution:** Use secure key management or encrypted storage.

```typescript
// ✅ CORRECT: Encrypted key storage
await SecureStorage.initialize(userId);
await SecureStorage.setItem("userKey", encryptedUserKey);

// Or use key management service
const userKey = await keyManagementService.getUserKey(userId);
```

---

### ❌ Not Calling `cleanup()`

**Problem:** Not cleaning up service resources.

```typescript
// ❌ WRONG: Resources not cleaned up
const fileService = new ZKIMFileService({}, undefined, storage);
await fileService.initialize();
// ... use service ...
// ❌ Service resources not cleaned up (timers, connections, etc.)
```

**Solution:** Always call `cleanup()` when done.

```typescript
// ✅ CORRECT: Clean up resources
const fileService = new ZKIMFileService({}, undefined, storage);
await fileService.initialize();
try {
  // ... use service ...
} finally {
  await fileService.cleanup(); // ✅ Clean up resources
}
```

---

### ❌ Using `downloadFile()` Without Keys

**Problem:** Not providing required `platformKey` and `userKey` parameters.

```typescript
// ❌ WRONG: Missing required keys
const result = await fileService.downloadFile(fileId, userId);
// ❌ Error: Keys are required parameters
```

**Solution:** Always pass `platformKey` and `userKey` explicitly.

```typescript
// ✅ CORRECT: Explicit keys required
const result = await fileService.downloadFile(
  fileId,
  userId,
  platformKey, // ✅ Required
  userKey      // ✅ Required
);
```

---

### ❌ Not Checking Return Values

**Problem:** Assuming operations always succeed.

```typescript
// ❌ WRONG: Not checking success
const result = await fileService.createZkimFile(data, userId, platformKey, userKey);
const fileId = result.file.header.fileId; // ❌ What if result.success is false?
```

**Solution:** Always check `success` field.

```typescript
// ✅ CORRECT: Check success before accessing data
const result = await fileService.createZkimFile(data, userId, platformKey, userKey);
if (result.success && result.file) {
  const fileId = result.file.header.fileId; // ✅ Safe
} else {
  console.error("File creation failed:", result.error);
}
```

---

### ❌ Storage Backend Not Returning `null` for Missing Files

**Problem:** Storage backend throwing errors instead of returning `null`.

```typescript
// ❌ WRONG: Throwing error for missing file
async get(key: string): Promise<Uint8Array | null> {
  const file = await s3.getObject(key);
  if (!file) {
    throw new Error("File not found"); // ❌ Should return null
  }
  return file;
}
```

**Solution:** Return `null` for missing files, throw only for actual errors.

```typescript
// ✅ CORRECT: Return null for missing files
async get(key: string): Promise<Uint8Array | null> {
  try {
    const file = await s3.getObject(key);
    return file || null; // ✅ Return null if not found
  } catch (error) {
    if (error.code === "NoSuchKey") {
      return null; // ✅ Missing file = null
    }
    throw error; // ✅ Real errors should throw
  }
}
```

---

### ❌ Using Wrong Key Sizes

**Problem:** Using keys that aren't 32 bytes.

```typescript
// ❌ WRONG: Wrong key size
const userKey = sodium.randombytes_buf(16); // ❌ 16 bytes, should be 32
const result = await fileService.createZkimFile(data, userId, platformKey, userKey);
// ❌ Error: Key must be 32 bytes
```

**Solution:** Always use 32-byte keys.

```typescript
// ✅ CORRECT: 32-byte keys
const userKey = sodium.randombytes_buf(32); // ✅ 32 bytes
// Or derive from authentication
const userKey = await deriveKeyFromAuth(userId, credential); // ✅ Returns 32 bytes
```

---

### ❌ Not Waiting for `sodium.ready`

**Problem:** Using libsodium before it's ready.

```typescript
// ❌ WRONG: Using sodium before ready
import sodium from "libsodium-wrappers-sumo";
const key = sodium.randombytes_buf(32); // ❌ May fail if sodium not ready
```

**Solution:** Always wait for `sodium.ready`.

```typescript
// ✅ CORRECT: Wait for sodium to be ready
import sodium from "libsodium-wrappers-sumo";
await sodium.ready; // ✅ Required
const key = sodium.randombytes_buf(32); // ✅ Works
```

---

### ❌ Not Handling Service Errors Properly

**Problem:** Catching errors but not handling `ServiceError` specifically.

```typescript
// ❌ WRONG: Generic error handling
try {
  await fileService.createZkimFile(...);
} catch (error) {
  console.error("Error:", error); // ❌ Doesn't handle ServiceError details
}
```

**Solution:** Handle `ServiceError` with proper error codes.

```typescript
// ✅ CORRECT: Handle ServiceError properly
try {
  await fileService.createZkimFile(...);
} catch (error) {
  if (error instanceof ServiceError) {
    console.error("Service error:", error.code, error.message);
    // Handle specific error codes
    if (error.code === "INVALID_KEY") {
      // Handle invalid key error
    }
  } else {
    console.error("Unexpected error:", error);
  }
}
```

---

## Prevention Checklist

Before deploying to production, verify:

- [ ] Keys are derived from authentication (not random)
- [ ] `initialize()` is called before use
- [ ] All async operations are wrapped in try/catch
- [ ] Keys are stored securely (not plaintext)
- [ ] `cleanup()` is called when done
- [ ] `downloadFile()` uses explicit keys
- [ ] Return values are checked (`success` field)
- [ ] Storage backend returns `null` for missing files
- [ ] Keys are 32 bytes
- [ ] `sodium.ready` is awaited
- [ ] `ServiceError` is handled properly

---

**Last Updated:** 2026-01-09

