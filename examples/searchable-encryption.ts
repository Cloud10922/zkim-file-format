/**
 * Searchable Encryption Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to:
 * 1. Enable searchable encryption
 * 2. Index files with keywords
 * 3. Search for files using privacy-preserving trapdoors
 * 4. Handle search results
 */

import {
  ZKIMFileService,
  SearchableEncryption,
  InMemoryStorage,
  defaultLogger,
} from "../src/index";
// libsodium-wrappers-sumo uses default export, not namespace export
// @ts-expect-error - libsodium-wrappers-sumo has incorrect type definitions
import sodium from "libsodium-wrappers-sumo";

async function main() {
  // Wait for libsodium to be ready
  await sodium.ready;

  // Generate encryption keys
  const platformKey = sodium.randombytes_buf(32);
  const userKey = sodium.randombytes_buf(32);
  const userId = "example-user";

  // Create storage backend
  const storage = new InMemoryStorage();

  // Initialize the file service with searchable encryption enabled
  const fileService = new ZKIMFileService(
    {
      enableCompression: true,
      enableSearchableEncryption: true, // Enable searchable encryption
      enableIntegrityValidation: true,
    },
    defaultLogger,
    storage
  );

  await fileService.initialize();

  // Get the searchable encryption service
  const searchService = await SearchableEncryption.getServiceInstance();

  // Create multiple files with different content
  const files = [
    {
      content: new TextEncoder().encode("This is a document about cryptography and security."),
      fileName: "crypto-doc.txt",
      keywords: ["cryptography", "security", "encryption"],
    },
    {
      content: new TextEncoder().encode("This document discusses privacy and zero-knowledge proofs."),
      fileName: "privacy-doc.txt",
      keywords: ["privacy", "zero-knowledge", "security"],
    },
    {
      content: new TextEncoder().encode("This is a file about blockchain and distributed systems."),
      fileName: "blockchain-doc.txt",
      keywords: ["blockchain", "distributed", "systems"],
    },
  ];

  const createdFiles: string[] = [];

  // Create and index files
  for (const fileData of files) {
    const result = await fileService.createZkimFile(
      fileData.content,
      userId,
      platformKey,
      userKey,
      {
        fileName: fileData.fileName,
        mimeType: "text/plain",
      }
    );

    if (result.success && result.file) {
      createdFiles.push(result.file.header.fileId);

      // Index the file (keywords are extracted from metadata)
      await searchService.indexFile(result.file, userId);

      // File indexed successfully
    }
  }

  // Search for files containing "security"
  const securityResults = await searchService.search(
    {
      queryId: `search-${Date.now()}-1`,
      query: "security",
      userId,
      timestamp: Date.now(),
      priority: "medium",
    },
    10
  );
  // Found securityResults.results.length files matching "security"

  // Search for files containing "cryptography"
  const cryptoResults = await searchService.search(
    {
      queryId: `search-${Date.now()}-2`,
      query: "cryptography",
      userId,
      timestamp: Date.now(),
      priority: "medium",
    },
    10
  );
  // Found cryptoResults.results.length files matching "cryptography"

  // Search for files containing "blockchain"
  const blockchainResults = await searchService.search(
    {
      queryId: `search-${Date.now()}-3`,
      query: "blockchain",
      userId,
      timestamp: Date.now(),
      priority: "medium",
    },
    10
  );
  // Found blockchainResults.results.length files matching "blockchain"

  // Retrieve and decrypt search results
  for (const result of securityResults.results) {
    const fileResult = await fileService.getZkimFile(result.fileId);
    if (fileResult.success && fileResult.data) {
      const decrypted = await fileService.decryptZkimFile(
        fileResult.data,
        userId,
        userKey
      );
      const text = new TextDecoder().decode(decrypted);
      // Process decrypted file: text
    }
  }

  // Search completed successfully

  // Cleanup
  await fileService.cleanup();
  await searchService.cleanup();
}

// Run the example
main().catch((error) => {
  // Handle error appropriately
  throw error;
});

