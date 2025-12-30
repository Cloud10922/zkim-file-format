/**
 * Integrity Validation Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to:
 * 1. Create files with integrity validation enabled
 * 2. Validate file integrity
 * 3. Detect tampering attempts
 * 4. Handle validation errors
 */

import {
  ZKIMFileService,
  ZkimIntegrity,
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

  // Initialize the file service with integrity validation enabled
  const fileService = new ZKIMFileService(
    {
      enableCompression: true,
      enableSearchableEncryption: false,
      enableIntegrityValidation: true, // Enable integrity validation
    },
    defaultLogger,
    storage
  );

  await fileService.initialize();

  // Get the integrity service
  const integrityService = await ZkimIntegrity.getServiceInstance();

  // Create a file
  const content = new TextEncoder().encode("This is a secure document that needs integrity validation.");
  const result = await fileService.createZkimFile(
    content,
    userId,
    platformKey,
    userKey,
    {
      fileName: "secure-doc.txt",
      mimeType: "text/plain",
    }
  );

  if (!result.success || !result.file) {
    throw new Error("Failed to create file");
  }

  const fileId = result.file.header.fileId;

  // Validate file integrity
  const validationResult = await integrityService.validateFile(
    result.file,
    platformKey,
    userKey
  );

  if (validationResult.isValid) {
    // File integrity is valid
  } else {
    // File validation failed
    const errors = validationResult.errors;
    // Handle validation errors
  }

  // Check for tampering
  const tamperingResult = await integrityService.detectTampering(result.file);
  if (tamperingResult.isTampered) {
    // File has been tampered with
    const tamperTypes = tamperingResult.tamperType;
    const evidence = tamperingResult.evidence;
  } else {
    // File is not tampered
  }

  // Validate individual chunks
  const chunksValid = await integrityService.validateChunks(
    result.file.chunks,
    result.file.header
  );

  if (chunksValid) {
    // All chunks are valid
  } else {
    // Some chunks are invalid
  }

  // Example: Simulate tampering detection
  // In a real scenario, you would retrieve the file from storage
  // and validate it before use
  const retrievedResult = await fileService.getZkimFile(fileId);
  if (retrievedResult.success && retrievedResult.data) {
    // Validate the retrieved file
    const retrievedValidation = await integrityService.validateFile(
      retrievedResult.data,
      platformKey,
      userKey
    );

    if (retrievedValidation.isValid) {
      // File is safe to use
      const decrypted = await fileService.decryptZkimFile(
        retrievedResult.data,
        userId,
        userKey
      );
      // Process decrypted file
    } else {
      // File integrity check failed - do not use
      throw new Error("File integrity validation failed");
    }
  }

  // Cleanup
  await fileService.cleanup();
  await integrityService.cleanup();
}

// Run the example
main().catch((error) => {
  // Handle error appropriately
  throw error;
});

