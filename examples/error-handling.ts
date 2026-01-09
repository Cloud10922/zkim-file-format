/**
 * Error Handling and Recovery Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to:
 * 1. Handle errors gracefully
 * 2. Use error recovery service
 * 3. Detect and recover from corruption
 * 4. Implement proper error handling patterns
 */

import {
  ZKIMFileService,
  ZkimErrorRecovery,
  InMemoryStorage,
  defaultLogger,
  ServiceError,
} from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

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
  const userKey = sodium.randombytes_buf(32);
  const userId = "example-user";

  // Create storage backend
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

  // Get the error recovery service
  const errorRecovery = await ZkimErrorRecovery.getServiceInstance();

  // Create a file
  const content = new TextEncoder().encode("Important document content");
  const result = await fileService.createZkimFile(
    content,
    userId,
    platformKey,
    userKey,
    {
      fileName: "important-doc.txt",
      mimeType: "text/plain",
    }
  );

  if (!result.success || !result.file) {
    throw new Error("Failed to create file");
  }

  // Example 1: Handle decryption errors gracefully
  try {
    // Attempt decryption with wrong key
    // Using wrong key to demonstrate error handling
    // In production, this would be a key derived from different auth credentials
    const wrongKey = sodium.randombytes_buf(32);
    await fileService.decryptZkimFile(result.file, userId, wrongKey);
  } catch (error) {
    if (error instanceof ServiceError) {
      // Handle service error
      const errorCode = error.code;
      const errorMessage = error.message;
      // Log error and inform user
    } else {
      // Handle unexpected error
      throw error;
    }
  }

  // Example 2: Detect corruption in file data
  // Simulate corruption by modifying file data
  const corruptedFile = { ...result.file };
  if (corruptedFile.chunks.length > 0 && corruptedFile.chunks[0]) {
    // Corrupt first chunk
    const corruptedChunk = new Uint8Array(corruptedFile.chunks[0].encryptedData);
    corruptedChunk[0] = 0xff; // Modify first byte
    corruptedFile.chunks[0] = {
      ...corruptedFile.chunks[0],
      encryptedData: corruptedChunk,
    };
  }

  // Attempt recovery from corruption
  const recoveryResult = await errorRecovery.recoverFromCorruption(
    new TextEncoder().encode(JSON.stringify(corruptedFile)),
    result.file.header.fileId,
    {
      maxRepairAttempts: 3,
      enableReconstruction: true,
      strictValidation: false,
    }
  );

  if (recoveryResult.success && recoveryResult.recoveredData) {
    // Recovery successful
    const repairActions = recoveryResult.repairActions;
    const warnings = recoveryResult.warnings;
  } else {
    // Recovery failed
    const errors = recoveryResult.errors;
    // Handle recovery failure
  }

  // Example 3: Handle storage errors
  try {
    // Attempt to retrieve non-existent file
    await fileService.getZkimFile("non-existent-file-id");
  } catch (error) {
    if (error instanceof ServiceError) {
      // Handle storage error
      if (error.code === "FILE_NOT_FOUND") {
        // File doesn't exist - handle gracefully
      } else {
        // Other storage error
        throw error;
      }
    } else {
      throw error;
    }
  }

  // Example 4: Validate file before decryption
  try {
    const retrievedResult = await fileService.getZkimFile(
      result.objectId ?? result.file.header.fileId
    );

    if (retrievedResult.success && retrievedResult.data) {
      // Validate and repair file before decryption
      const validationResult = await errorRecovery.validateAndRepair(
        new TextEncoder().encode(JSON.stringify(retrievedResult.data)),
        retrievedResult.data.header.fileId,
        {
          enableRepair: true,
          strictMode: false,
        }
      );

      if (validationResult.success && validationResult.recoveredData) {
        // File is valid or repaired - safe to decrypt
        const decrypted = await fileService.decryptZkimFile(
          retrievedResult.data,
          userId,
          userKey
        );
        // Process decrypted data
      } else {
        // File validation/repair failed
        const validationErrors = validationResult.errors;
        // Attempt recovery or report error
      }
    }
  } catch (error) {
    // Handle validation or decryption errors
    if (error instanceof ServiceError) {
      // Log error with context
      const errorContext = {
        code: error.code,
        message: error.message,
        details: error.details,
      };
    } else {
      throw error;
    }
  }

  // Example 5: Retry pattern for transient errors
  const maxRetries = 3;
  let attempts = 0;
  let success = false;

  while (attempts < maxRetries && !success) {
    try {
      const retrievedResult = await fileService.getZkimFile(
        result.objectId ?? result.file.header.fileId
      );

      if (retrievedResult.success && retrievedResult.data) {
        const decrypted = await fileService.decryptZkimFile(
          retrievedResult.data,
          userId,
          userKey
        );
        success = true;
        // Process decrypted data
      }
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) {
        // Max retries reached - handle failure
        throw error;
      }
      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
    }
  }

  // Cleanup
  await fileService.cleanup();
  await errorRecovery.cleanup();
}

// Run the example
main().catch((error) => {
  // Handle error appropriately
  throw error;
});

