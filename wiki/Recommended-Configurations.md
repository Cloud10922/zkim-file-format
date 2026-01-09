# Recommended Configurations

Pre-configured settings for common use cases with `@zkim-platform/file-format`.

---

## Configuration Presets

### High Security (Default)

**Use Case:** Maximum security with integrity validation and compression.

```typescript
const fileService = new ZKIMFileService({
  enableCompression: true,
  enableSearchableEncryption: false, // Disable if not needed
  enableIntegrityValidation: true,
  maxFileSize: 100 * 1024 * 1024, // 100 MB
  chunkSize: 64 * 1024, // 64 KB chunks
});
```

**Features:**
- ✅ Integrity validation enabled (tamper detection)
- ✅ Compression enabled (storage efficiency)
- ✅ Searchable encryption disabled (better performance)
- ✅ Standard chunk size (64 KB)

**Best For:**
- Financial data
- Legal documents
- Medical records
- Government data
- Long-term archival

---

### Performance Optimized

**Use Case:** Maximum performance with minimal overhead.

```typescript
const fileService = new ZKIMFileService({
  enableCompression: false,
  enableSearchableEncryption: false,
  enableIntegrityValidation: false, // Disable for speed
  maxFileSize: 500 * 1024 * 1024, // 500 MB
  chunkSize: 128 * 1024, // 128 KB chunks (larger = fewer operations)
});
```

**Features:**
- ❌ Compression disabled (faster processing)
- ❌ Searchable encryption disabled (no search overhead)
- ❌ Integrity validation disabled (faster file operations)
- ✅ Larger chunk size (fewer encryption operations)

**Best For:**
- High-throughput applications
- Real-time file processing
- Large file uploads
- Performance-critical systems
- Temporary file storage

**⚠️ WARNING:** Disabling integrity validation removes tamper detection. Only use when performance is more critical than security.

---

### Privacy-First

**Use Case:** Maximum privacy with searchable encryption and integrity validation.

```typescript
const fileService = new ZKIMFileService({
  enableCompression: true,
  enableSearchableEncryption: true,
  enableIntegrityValidation: true,
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  chunkSize: 32 * 1024, // 32 KB chunks (smaller for better search indexing)
});
```

**Features:**
- ✅ Searchable encryption enabled (privacy-preserving search)
- ✅ Integrity validation enabled (tamper detection)
- ✅ Compression enabled (storage efficiency)
- ✅ Smaller chunk size (better search indexing)

**Best For:**
- Messaging applications
- Email systems
- Document management
- Content sharing platforms
- Privacy-focused applications

**Note:** Searchable encryption adds overhead. Use only when search is required.

---

### Balanced (Recommended for Most Use Cases)

**Use Case:** Good balance of security, performance, and features.

```typescript
const fileService = new ZKIMFileService({
  enableCompression: true,
  enableSearchableEncryption: false, // Enable only if search is needed
  enableIntegrityValidation: true,
  maxFileSize: 100 * 1024 * 1024, // 100 MB
  chunkSize: 64 * 1024, // 64 KB chunks
});
```

**Features:**
- ✅ Integrity validation enabled
- ✅ Compression enabled
- ❌ Searchable encryption disabled (enable if needed)
- ✅ Standard chunk size

**Best For:**
- General-purpose applications
- File storage systems
- Content management systems
- Most production applications

---

### Development/Testing

**Use Case:** Fast development with minimal security overhead.

```typescript
const fileService = new ZKIMFileService({
  enableCompression: false,
  enableSearchableEncryption: false,
  enableIntegrityValidation: false,
  maxFileSize: 10 * 1024 * 1024, // 10 MB (smaller for testing)
  chunkSize: 32 * 1024, // 32 KB chunks
});
```

**Features:**
- ❌ All optional features disabled
- ✅ Fast processing
- ✅ Small file size limit
- ✅ Small chunk size

**Best For:**
- Development environments
- Unit testing
- Integration testing
- Prototyping

**⚠️ WARNING:** Never use this configuration in production!

---

## Configuration Options Reference

### `enableCompression`

- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable GZIP compression for file chunks
- **Trade-off:** Compression reduces storage size but adds processing time
- **Recommendation:** Enable for most use cases, disable for performance-critical applications

### `enableSearchableEncryption`

- **Type:** `boolean`
- **Default:** `false`
- **Description:** Enable privacy-preserving searchable encryption (OPRF-based)
- **Trade-off:** Enables search but adds significant overhead
- **Recommendation:** Enable only when search functionality is required

### `enableIntegrityValidation`

- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable integrity validation and tamper detection
- **Trade-off:** Adds validation overhead but provides security
- **Recommendation:** Always enable in production, disable only for performance testing

### `maxFileSize`

- **Type:** `number`
- **Default:** `100 * 1024 * 1024` (100 MB)
- **Description:** Maximum file size in bytes
- **Trade-off:** Larger limit allows bigger files but increases memory usage
- **Recommendation:** Set based on your application's file size requirements

### `chunkSize`

- **Type:** `number`
- **Default:** `64 * 1024` (64 KB)
- **Description:** Size of each encrypted chunk in bytes
- **Trade-off:** Larger chunks = fewer operations but more memory per chunk
- **Recommendation:** 
  - 32 KB: Better for search indexing
  - 64 KB: Balanced (default)
  - 128 KB: Better performance for large files

---

## Choosing the Right Configuration

### Decision Tree

1. **Do you need search functionality?**
   - **Yes** → Enable `enableSearchableEncryption: true` (Privacy-First preset)
   - **No** → Continue to step 2

2. **Is performance critical?**
   - **Yes** → Use Performance Optimized preset
   - **No** → Continue to step 3

3. **Is security critical?**
   - **Yes** → Use High Security preset
   - **No** → Use Balanced preset

### Use Case Examples

| Use Case | Recommended Preset | Notes |
|----------|-------------------|-------|
| Financial records | High Security | Maximum security required |
| Messaging app | Privacy-First | Search + privacy needed |
| File upload service | Balanced | General-purpose |
| Real-time processing | Performance Optimized | Speed critical |
| Development | Development/Testing | Fast iteration |

---

## Advanced Configuration

### Custom Configuration Example

```typescript
const fileService = new ZKIMFileService({
  // Compression
  enableCompression: true,
  
  // Searchable Encryption
  enableSearchableEncryption: true,
  searchableEncryptionConfig: {
    enableQueryBatching: true,
    batchSize: 10,
    batchTimeout: 1000, // 1 second
    enableTrapdoorRotation: true,
    rotationThreshold: 100,
  },
  
  // Integrity Validation
  enableIntegrityValidation: true,
  integrityConfig: {
    enableHeaderValidation: true,
    enableChunkValidation: true,
    enableSignatureValidation: true,
  },
  
  // File Limits
  maxFileSize: 200 * 1024 * 1024, // 200 MB
  chunkSize: 128 * 1024, // 128 KB
  
  // Performance
  enablePerformanceMonitoring: true,
  performanceThresholds: {
    maxEncryptionTime: 5000, // 5 seconds
    maxDecryptionTime: 3000, // 3 seconds
  },
});
```

---

## Configuration Best Practices

### ✅ DO:

1. **Enable integrity validation in production**
   ```typescript
   enableIntegrityValidation: true
   ```

2. **Use compression for storage efficiency**
   ```typescript
   enableCompression: true
   ```

3. **Enable searchable encryption only when needed**
   ```typescript
   enableSearchableEncryption: true // Only if search is required
   ```

4. **Set appropriate file size limits**
   ```typescript
   maxFileSize: 100 * 1024 * 1024 // Based on your use case
   ```

5. **Choose chunk size based on file size**
   - Small files (< 1 MB): 32 KB chunks
   - Medium files (1-100 MB): 64 KB chunks
   - Large files (> 100 MB): 128 KB chunks

### ❌ DON'T:

1. **Don't disable integrity validation in production**
   ```typescript
   enableIntegrityValidation: false // ❌ BAD for production
   ```

2. **Don't enable searchable encryption if not needed**
   ```typescript
   enableSearchableEncryption: true // ❌ Adds overhead unnecessarily
   ```

3. **Don't use development config in production**
   ```typescript
   // ❌ BAD: Development config in production
   enableIntegrityValidation: false
   ```

4. **Don't set file size limits too high**
   ```typescript
   maxFileSize: Number.MAX_SAFE_INTEGER // ❌ Can cause memory issues
   ```

5. **Don't use very small chunk sizes**
   ```typescript
   chunkSize: 1024 // ❌ Too small, inefficient
   ```

---

## Performance Impact

### Configuration Impact on Performance

| Feature | Performance Impact | Memory Impact | Storage Impact |
|---------|-------------------|---------------|---------------|
| Compression | -20% to -30% | +10% | -30% to -50% |
| Searchable Encryption | -40% to -60% | +50% | +10% |
| Integrity Validation | -5% to -10% | +5% | +5% |

**Note:** Performance impact varies based on file size, hardware, and workload.

---

## Changing Configuration

You can change configuration by creating a new service instance with different settings:

```typescript
// Service with compression disabled
const serviceWithoutCompression = new ZKIMFileService({
  enableCompression: false,
});

// Service with compression enabled
const serviceWithCompression = new ZKIMFileService({
  enableCompression: true,
});

// Files created with one service configuration are compatible with other configurations
// New files will use the configuration of the service instance that creates them
```

**Note:** Configuration affects new files only. Existing files retain their original configuration from when they were created.

---

## See Also

- **[Getting Started](Getting-Started)** - Basic setup and installation
- **[API Reference](API-Reference)** - Complete API documentation
- **[Security](Security)** - Security best practices
- **[Examples](Examples)** - Code examples and patterns

---

**Last Updated:** 2026-01-09

