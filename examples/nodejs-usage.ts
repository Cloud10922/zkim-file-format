/**
 * Node.js Usage Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to use @zkim-platform/file-format in Node.js:
 * 1. Using Node.js file system for storage
 * 2. Working with file paths
 * 3. Node.js-specific error handling
 * 4. Integration with Node.js streams (if applicable)
 * 
 * Note: This example requires Node.js 20+ and uses Node.js built-in modules
 */

import {
  ZKIMFileService,
  defaultLogger,
  type IStorageBackend,
} from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Node.js File System Storage Backend
 * Implements IStorageBackend using Node.js fs module
 */
class NodeFileSystemStorage implements IStorageBackend {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const filePath = path.join(this.baseDir, key);
      const data = await fs.readFile(filePath);
      return new Uint8Array(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, Buffer.from(value));
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = path.join(this.baseDir, key);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const filePath = path.join(this.baseDir, key);
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.baseDir, { recursive: true });
      for (const file of files) {
        const filePath = path.join(this.baseDir, file);
        await fs.unlink(filePath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async keys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir, { recursive: true });
      return files.filter((file) => typeof file === "string");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

async function main() {
  // Wait for libsodium to be ready
  await sodium.ready;

  // ⚠️ SECURITY WARNING: This example uses random keys for simplicity.
  // In production, ALWAYS derive keys from actual user authentication.
  // See examples/authentication-integration.ts for proper key derivation.
  // See wiki/Authentication-Integration.md for complete guide.
  
  // Platform key (store securely, same for all users)
  const platformKey = sodium.randombytes_buf(32);
  
  // User key (in production, derive from user authentication)
  // Example: const userKey = await deriveKeyFromPassword(userId, password, salt);
  const userKey = sodium.randombytes_buf(32);
  const userId = "nodejs-user";

  // Create storage directory
  const storageDir = path.join(__dirname, "storage");
  await fs.mkdir(storageDir, { recursive: true });

  // Create Node.js file system storage backend
  const storage = new NodeFileSystemStorage(storageDir);

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

  // Example 1: Encrypt a file from disk
  const inputFilePath = path.join(__dirname, "input.txt");
  const inputContent = new TextEncoder().encode("Hello from Node.js!");
  await fs.writeFile(inputFilePath, inputContent);

  const result = await fileService.createZkimFile(
    inputContent,
    userId,
    platformKey,
    userKey,
    {
      fileName: path.basename(inputFilePath),
      mimeType: "text/plain",
    }
  );

  if (!result.success || !result.file) {
    throw new Error("Failed to create encrypted file");
  }

  // File encrypted and stored
  const fileId = result.file.header.fileId;
  const objectId = result.objectId;

  // Example 2: Retrieve and decrypt file
  const retrievedResult = await fileService.getZkimFile(
    objectId ?? fileId
  );

  if (retrievedResult.success && retrievedResult.data) {
    const decrypted = await fileService.decryptZkimFile(
      retrievedResult.data,
      userId,
      userKey
    );

    // Save decrypted content to disk
    const outputFilePath = path.join(__dirname, "output.txt");
    await fs.writeFile(outputFilePath, Buffer.from(decrypted));

    // Verify content matches
    const originalText = new TextDecoder().decode(inputContent);
    const decryptedText = new TextDecoder().decode(decrypted);
    if (originalText === decryptedText) {
      // Content verified successfully
    }
  }

  // Example 3: List all stored files
  const storedFiles = await storage.list();
  // List of stored file keys: storedFiles

  // Example 4: Delete a file
  if (objectId) {
    await storage.delete(objectId);
  }

  // Cleanup: Remove storage directory (optional)
  // await fs.rm(storageDir, { recursive: true, force: true });

  // Cleanup services
  await fileService.cleanup();
}

// Run the example
main().catch((error) => {
  // Handle error appropriately
  throw error;
});

