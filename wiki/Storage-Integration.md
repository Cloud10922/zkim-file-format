# Storage Integration

This is the **most important guide** for integrating `@zkim-platform/file-format` with your storage backend. The file format is storage-agnostic and works with any storage system via the `IStorageBackend` interface.

---

## Overview

### Why Custom Storage Backends?

The ZKIM file format is designed to be storage-agnostic. This means:
- ✅ Works with **any storage system** (S3, Azure, GCS, IPFS, databases, etc.)
- ✅ No vendor lock-in
- ✅ Use your existing infrastructure
- ✅ Implement custom caching, replication, or optimization strategies

### IStorageBackend Interface

All storage backends must implement the `IStorageBackend` interface:

```typescript
export interface IStorageBackend {
  /**
   * Store data with the given key
   */
  set(key: string, value: Uint8Array): Promise<void>;

  /**
   * Retrieve data by key
   */
  get(key: string): Promise<Uint8Array | null>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete data by key
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all data
   */
  clear(): Promise<void>;

  /**
   * Get all keys
   */
  keys(): Promise<string[]>;
}
```

### Benefits

- **Simple Interface:** Only 6 methods to implement
- **Type-Safe:** Full TypeScript support
- **Async:** All operations are asynchronous
- **Binary Data:** Works with `Uint8Array` (binary data)

---

## Implementation Guide

### Basic Structure

```typescript
import { IStorageBackend } from "@zkim-platform/file-format";

export class MyStorageBackend implements IStorageBackend {
  // Implement all required methods
  async set(key: string, value: Uint8Array): Promise<void> {
    // Store data
  }

  async get(key: string): Promise<Uint8Array | null> {
    // Retrieve data
  }

  async has(key: string): Promise<boolean> {
    // Check existence
  }

  async delete(key: string): Promise<void> {
    // Delete data
  }

  async clear(): Promise<void> {
    // Clear all data
  }

  async keys(): Promise<string[]> {
    // Get all keys
  }
}
```

### Error Handling

All methods should throw `ServiceError` on failure:

```typescript
import { ServiceError } from "@zkim-platform/file-format";

async get(key: string): Promise<Uint8Array | null> {
  try {
    // Storage operation
  } catch (error) {
    throw new ServiceError(`Storage operation failed: ${error.message}`, {
      code: "STORAGE_ERROR",
      details: { key, error },
    });
  }
}
```

### Return Types

- **`set()`:** Returns `Promise<void>` (throws on error)
- **`get()`:** Returns `Promise<Uint8Array | null>` (`null` if not found)
- **`has()`:** Returns `Promise<boolean>` (true if exists)
- **`delete()`:** Returns `Promise<void>` (throws on error)
- **`clear()`:** Returns `Promise<void>` (throws on error)
- **`keys()`:** Returns `Promise<string[]>` (empty array if none)

---

## Storage Backend Examples

### 1. AWS S3 Storage

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { IStorageBackend } from "@zkim-platform/file-format";
import { ServiceError } from "@zkim-platform/file-format";

export class S3StorageBackend implements IStorageBackend {
  private s3Client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(
    bucket: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    prefix = "zkim-files/"
  ) {
    this.bucket = bucket;
    this.prefix = prefix;
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.getKey(key),
        Body: value,
        ContentType: "application/octet-stream",
      });
      await this.s3Client.send(command);
    } catch (error) {
      throw new ServiceError(`S3 upload failed: ${error.message}`, {
        code: "S3_UPLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getKey(key),
      });
      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        return null;
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      // Concatenate all chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw new ServiceError(`S3 download failed: ${error.message}`, {
        code: "S3_DOWNLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getKey(key),
      });
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw new ServiceError(`S3 check failed: ${error.message}`, {
        code: "S3_CHECK_ERROR",
        details: { key, error },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.getKey(key),
      });
      await this.s3Client.send(command);
    } catch (error) {
      throw new ServiceError(`S3 delete failed: ${error.message}`, {
        code: "S3_DELETE_ERROR",
        details: { key, error },
      });
    }
  }

  async clear(): Promise<void> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
      });

      let continuationToken: string | undefined;
      do {
        const response = await this.s3Client.send({
          ...command,
          ContinuationToken: continuationToken,
        });

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Key) {
              await this.delete(object.Key.substring(this.prefix.length));
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
    } catch (error) {
      throw new ServiceError(`S3 clear failed: ${error.message}`, {
        code: "S3_CLEAR_ERROR",
        details: { error },
      });
    }
  }

  async keys(): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
      });

      const keys: string[] = [];
      let continuationToken: string | undefined;
      
      do {
        const response = await this.s3Client.send({
          ...command,
          ContinuationToken: continuationToken,
        });

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Key) {
              keys.push(object.Key.substring(this.prefix.length));
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return keys;
    } catch (error) {
      throw new ServiceError(`S3 list failed: ${error.message}`, {
        code: "S3_LIST_ERROR",
        details: { error },
      });
    }
  }
}

// Usage
const s3Storage = new S3StorageBackend(
  "my-bucket",
  "us-east-1",
  process.env.AWS_ACCESS_KEY_ID!,
  process.env.AWS_SECRET_ACCESS_KEY!,
  "zkim-files/"
);

const fileService = new ZKIMFileService(config, logger, s3Storage);
```

### 2. Azure Blob Storage

```typescript
import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { IStorageBackend } from "@zkim-platform/file-format";
import { ServiceError } from "@zkim-platform/file-format";

export class AzureBlobStorageBackend implements IStorageBackend {
  private containerClient: ContainerClient;
  private prefix: string;

  constructor(
    connectionString: string,
    containerName: string,
    prefix = "zkim-files/"
  ) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = blobServiceClient.getContainerClient(containerName);
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(this.getKey(key));
      await blockBlobClient.upload(value, value.length, {
        blobHTTPHeaders: { blobContentType: "application/octet-stream" },
      });
    } catch (error: any) {
      throw new ServiceError(`Azure upload failed: ${error.message}`, {
        code: "AZURE_UPLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(this.getKey(key));
      const downloadResponse = await blockBlobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        return null;
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw new ServiceError(`Azure download failed: ${error.message}`, {
        code: "AZURE_DOWNLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(this.getKey(key));
      await blockBlobClient.getProperties();
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw new ServiceError(`Azure check failed: ${error.message}`, {
        code: "AZURE_CHECK_ERROR",
        details: { key, error },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(this.getKey(key));
      await blockBlobClient.delete();
    } catch (error: any) {
      if (error.statusCode !== 404) {
        throw new ServiceError(`Azure delete failed: ${error.message}`, {
          code: "AZURE_DELETE_ERROR",
          details: { key, error },
        });
      }
    }
  }

  async clear(): Promise<void> {
    try {
      const blobs = this.containerClient.listBlobsFlat({ prefix: this.prefix });
      for await (const blob of blobs) {
        await this.delete(blob.name.substring(this.prefix.length));
      }
    } catch (error: any) {
      throw new ServiceError(`Azure clear failed: ${error.message}`, {
        code: "AZURE_CLEAR_ERROR",
        details: { error },
      });
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys: string[] = [];
      const blobs = this.containerClient.listBlobsFlat({ prefix: this.prefix });
      for await (const blob of blobs) {
        keys.push(blob.name.substring(this.prefix.length));
      }
      return keys;
    } catch (error: any) {
      throw new ServiceError(`Azure list failed: ${error.message}`, {
        code: "AZURE_LIST_ERROR",
        details: { error },
      });
    }
  }
}
```

### 3. Google Cloud Storage

```typescript
import { Storage } from "@google-cloud/storage";
import { IStorageBackend } from "@zkim-platform/file-format";
import { ServiceError } from "@zkim-platform/file-format";

export class GCSStorageBackend implements IStorageBackend {
  private storage: Storage;
  private bucket: string;
  private prefix: string;

  constructor(
    bucketName: string,
    keyFilename?: string,
    prefix = "zkim-files/"
  ) {
    this.storage = new Storage({ keyFilename });
    this.bucket = bucketName;
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.getKey(key));
      await file.save(Buffer.from(value), {
        contentType: "application/octet-stream",
      });
    } catch (error: any) {
      throw new ServiceError(`GCS upload failed: ${error.message}`, {
        code: "GCS_UPLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.getKey(key));
      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }

      const [data] = await file.download();
      return new Uint8Array(data);
    } catch (error: any) {
      if (error.code === 404) {
        return null;
      }
      throw new ServiceError(`GCS download failed: ${error.message}`, {
        code: "GCS_DOWNLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.getKey(key));
      const [exists] = await file.exists();
      return exists;
    } catch (error: any) {
      throw new ServiceError(`GCS check failed: ${error.message}`, {
        code: "GCS_CHECK_ERROR",
        details: { key, error },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const file = this.storage.bucket(this.bucket).file(this.getKey(key));
      await file.delete();
    } catch (error: any) {
      if (error.code !== 404) {
        throw new ServiceError(`GCS delete failed: ${error.message}`, {
          code: "GCS_DELETE_ERROR",
          details: { key, error },
        });
      }
    }
  }

  async clear(): Promise<void> {
    try {
      const [files] = await this.storage.bucket(this.bucket).getFiles({
        prefix: this.prefix,
      });
      await Promise.all(files.map(file => file.delete()));
    } catch (error: any) {
      throw new ServiceError(`GCS clear failed: ${error.message}`, {
        code: "GCS_CLEAR_ERROR",
        details: { error },
      });
    }
  }

  async keys(): Promise<string[]> {
    try {
      const [files] = await this.storage.bucket(this.bucket).getFiles({
        prefix: this.prefix,
      });
      return files.map(file => file.name.substring(this.prefix.length));
    } catch (error: any) {
      throw new ServiceError(`GCS list failed: ${error.message}`, {
        code: "GCS_LIST_ERROR",
        details: { error },
      });
    }
  }
}
```

### 4. IPFS Storage

```typescript
import { create, IPFSHTTPClient } from "ipfs-http-client";
import { IStorageBackend } from "@zkim-platform/file-format";
import { ServiceError } from "@zkim-platform/file-format";

export class IPFSStorageBackend implements IStorageBackend {
  private ipfs: IPFSHTTPClient;
  private pinningService?: string;

  constructor(ipfsUrl = "http://localhost:5001", pinningService?: string) {
    this.ipfs = create({ url: ipfsUrl });
    this.pinningService = pinningService;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    try {
      const result = await this.ipfs.add(value, {
        pin: true,
        cidVersion: 1,
      });

      // Store key-to-CID mapping (you may want to use a separate index)
      const mapping = JSON.stringify({ key, cid: result.cid.toString() });
      await this.ipfs.add(new TextEncoder().encode(mapping), { pin: true });

      if (this.pinningService) {
        await this.ipfs.pin.remote.service.add(this.pinningService, result.cid);
      }
    } catch (error: any) {
      throw new ServiceError(`IPFS upload failed: ${error.message}`, {
        code: "IPFS_UPLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      // In a real implementation, you'd maintain a key-to-CID index
      // For this example, we'll search for the mapping
      // This is simplified - in production, use a proper index
      const chunks: Uint8Array[] = [];
      for await (const chunk of this.ipfs.cat(key)) {
        chunks.push(chunk);
      }

      if (chunks.length === 0) {
        return null;
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return result;
    } catch (error: any) {
      return null;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const data = await this.get(key);
      return data !== null;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // IPFS is immutable - deletion means unpinning
      // In production, maintain a key-to-CID index for proper deletion
      await this.ipfs.pin.rm(key);
    } catch (error: any) {
      // Ignore if not pinned
    }
  }

  async clear(): Promise<void> {
    // IPFS doesn't support clear - would need to unpin all
    // In production, maintain an index of all keys
  }

  async keys(): Promise<string[]> {
    // IPFS doesn't support listing - would need to maintain an index
    // In production, maintain a separate index of all keys
    return [];
  }
}
```

### 5. Database Storage (PostgreSQL)

```typescript
import { Pool } from "pg";
import { IStorageBackend } from "@zkim-platform/file-format";
import { ServiceError } from "@zkim-platform/file-format";

export class PostgreSQLStorageBackend implements IStorageBackend {
  private pool: Pool;
  private tableName: string;

  constructor(connectionString: string, tableName = "zkim_files") {
    this.pool = new Pool({ connectionString });
    this.tableName = tableName;
    this.initTable();
  }

  private async initTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key VARCHAR(255) PRIMARY KEY,
        data BYTEA NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO ${this.tableName} (key, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
        [key, Buffer.from(value)]
      );
    } catch (error: any) {
      throw new ServiceError(`PostgreSQL insert failed: ${error.message}`, {
        code: "POSTGRES_INSERT_ERROR",
        details: { key, error },
      });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.pool.query(
        `SELECT data FROM ${this.tableName} WHERE key = $1`,
        [key]
      );
      
      if (result.rows.length === 0) {
        return null;
      }

      return new Uint8Array(result.rows[0].data);
    } catch (error: any) {
      throw new ServiceError(`PostgreSQL select failed: ${error.message}`, {
        code: "POSTGRES_SELECT_ERROR",
        details: { key, error },
      });
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT 1 FROM ${this.tableName} WHERE key = $1`,
        [key]
      );
      return result.rows.length > 0;
    } catch (error: any) {
      throw new ServiceError(`PostgreSQL check failed: ${error.message}`, {
        code: "POSTGRES_CHECK_ERROR",
        details: { key, error },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.pool.query(
        `DELETE FROM ${this.tableName} WHERE key = $1`,
        [key]
      );
    } catch (error: any) {
      throw new ServiceError(`PostgreSQL delete failed: ${error.message}`, {
        code: "POSTGRES_DELETE_ERROR",
        details: { key, error },
      });
    }
  }

  async clear(): Promise<void> {
    try {
      await this.pool.query(`TRUNCATE TABLE ${this.tableName}`);
    } catch (error: any) {
      throw new ServiceError(`PostgreSQL clear failed: ${error.message}`, {
        code: "POSTGRES_CLEAR_ERROR",
        details: { error },
      });
    }
  }

  async keys(): Promise<string[]> {
    try {
      const result = await this.pool.query(`SELECT key FROM ${this.tableName}`);
      return result.rows.map(row => row.key);
    } catch (error: any) {
      throw new ServiceError(`PostgreSQL list failed: ${error.message}`, {
        code: "POSTGRES_LIST_ERROR",
        details: { error },
      });
    }
  }
}
```

### 6. REST API Backend

```typescript
import { IStorageBackend } from "@zkim-platform/file-format";
import { ServiceError } from "@zkim-platform/file-format";

export class RESTAPIStorageBackend implements IStorageBackend {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request(
    method: string,
    path: string,
    body?: Uint8Array
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? body : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    try {
      await this.request("PUT", `/files/${encodeURIComponent(key)}`, value);
    } catch (error: any) {
      throw new ServiceError(`REST API upload failed: ${error.message}`, {
        code: "REST_UPLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.request("GET", `/files/${encodeURIComponent(key)}`);
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error: any) {
      if (error.message.includes("404")) {
        return null;
      }
      throw new ServiceError(`REST API download failed: ${error.message}`, {
        code: "REST_DOWNLOAD_ERROR",
        details: { key, error },
      });
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const response = await this.request("HEAD", `/files/${encodeURIComponent(key)}`);
      return response.ok;
    } catch (error: any) {
      if (error.message.includes("404")) {
        return false;
      }
      throw new ServiceError(`REST API check failed: ${error.message}`, {
        code: "REST_CHECK_ERROR",
        details: { key, error },
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.request("DELETE", `/files/${encodeURIComponent(key)}`);
    } catch (error: any) {
      throw new ServiceError(`REST API delete failed: ${error.message}`, {
        code: "REST_DELETE_ERROR",
        details: { key, error },
      });
    }
  }

  async clear(): Promise<void> {
    try {
      await this.request("DELETE", "/files");
    } catch (error: any) {
      throw new ServiceError(`REST API clear failed: ${error.message}`, {
        code: "REST_CLEAR_ERROR",
        details: { error },
      });
    }
  }

  async keys(): Promise<string[]> {
    try {
      const response = await this.request("GET", "/files");
      const data = await response.json();
      return data.keys || [];
    } catch (error: any) {
      throw new ServiceError(`REST API list failed: ${error.message}`, {
        code: "REST_LIST_ERROR",
        details: { error },
      });
    }
  }
}
```

---

## Best Practices

### 1. Error Handling

Always wrap storage operations in try-catch and throw `ServiceError`:

```typescript
async get(key: string): Promise<Uint8Array | null> {
  try {
    // Storage operation
  } catch (error: any) {
    throw new ServiceError(`Storage operation failed: ${error.message}`, {
      code: "STORAGE_ERROR",
      details: { key, error },
    });
  }
}
```

### 2. Retry Logic

Implement retry logic for transient failures:

```typescript
async set(key: string, value: Uint8Array, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      // Storage operation
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 3. Caching

Implement caching for frequently accessed files:

```typescript
export class CachedStorageBackend implements IStorageBackend {
  private cache = new Map<string, { data: Uint8Array; timestamp: number }>();
  private ttl: number;

  constructor(private backend: IStorageBackend, ttl = 60000) {
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

  // ... implement other methods
}
```

### 4. Batch Operations

For better performance, implement batch operations:

```typescript
async setBatch(entries: Array<{ key: string; value: Uint8Array }>): Promise<void> {
  await Promise.all(entries.map(entry => this.set(entry.key, entry.value)));
}
```

### 5. Key Prefixing

Use prefixes to organize files:

```typescript
private getKey(key: string): string {
  return `zkim-files/${userId}/${key}`;
}
```

---

## Integration Patterns

### Adapter Pattern

Wrap existing storage libraries:

```typescript
export class StorageAdapter implements IStorageBackend {
  constructor(private existingStorage: ExistingStorage) {}

  async set(key: string, value: Uint8Array): Promise<void> {
    // Adapt existing storage API to IStorageBackend
    await this.existingStorage.put(key, Buffer.from(value));
  }
  // ... other methods
}
```

### Proxy Pattern

Add functionality (logging, metrics, caching):

```typescript
export class LoggingStorageProxy implements IStorageBackend {
  constructor(private backend: IStorageBackend, private logger: ILogger) {}

  async set(key: string, value: Uint8Array): Promise<void> {
    this.logger.info("Storage set", { key, size: value.length });
    await this.backend.set(key, value);
  }
  // ... other methods
}
```

### Factory Pattern

Create storage backends based on configuration:

```typescript
export function createStorageBackend(config: StorageConfig): IStorageBackend {
  switch (config.type) {
    case "s3":
      return new S3StorageBackend(config.s3);
    case "azure":
      return new AzureBlobStorageBackend(config.azure);
    case "gcs":
      return new GCSStorageBackend(config.gcs);
    default:
      return new InMemoryStorage();
  }
}
```

---

## Testing Your Storage Backend

```typescript
import { IStorageBackend } from "@zkim-platform/file-format";

async function testStorageBackend(backend: IStorageBackend) {
  const testKey = "test-key";
  const testData = new TextEncoder().encode("test data");

  // Test set
  await backend.set(testKey, testData);

  // Test has
  const exists = await backend.has(testKey);
  console.assert(exists === true, "Key should exist");

  // Test get
  const retrieved = await backend.get(testKey);
  console.assert(
    retrieved !== null && 
    retrieved.length === testData.length,
    "Data should match"
  );

  // Test delete
  await backend.delete(testKey);
  const stillExists = await backend.has(testKey);
  console.assert(stillExists === false, "Key should be deleted");

  console.log("✅ All storage backend tests passed!");
}
```

---

## Next Steps

1. Choose a storage backend that fits your needs
2. Implement the `IStorageBackend` interface
3. Test your implementation
4. Integrate with `ZKIMFileService`

For more examples and patterns, see:
- **[Examples](Examples)** - Real-world integration examples
- **[API Reference](API-Reference)** - Complete API documentation
- **[Architecture](Architecture)** - File format details

---

**Last Updated:** 2026-01-09

