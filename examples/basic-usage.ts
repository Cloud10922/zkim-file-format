/**
 * Basic Usage Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to:
 * 1. Initialize the ZKIM File Service
 * 2. Create an encrypted file
 * 3. Retrieve and decrypt the file
 */

import {
  ZKIMFileService,
  InMemoryStorage,
  defaultLogger,
} from "@zkim-platform/file-format";
// libsodium-wrappers-sumo uses default export, not namespace export
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
  // Example: const userKey = await deriveKeyFromWallet(walletAddress, signature);
  const userKey = sodium.randombytes_buf(32);
  const userId = "example-user";

  // Create storage backend (optional - in-memory for this example)
  const storage = new InMemoryStorage();

  // Initialize the file service with storage and logger
  const fileService = new ZKIMFileService(
    {
      enableCompression: true,
      enableSearchableEncryption: false, // Disable for simple example
      enableIntegrityValidation: true,
    },
    defaultLogger,
    storage
  );

  await fileService.initialize();

  // Create some test data
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

  if (!result.success || !result.file) {
    console.error("Failed to create file");
    return;
  }

  console.log("✅ File created successfully!");
  console.log("File ID:", result.file.header.fileId);
  console.log("Object ID:", result.objectId ?? "N/A");
  console.log("Chunks:", result.file.chunks.length);

  // Retrieve the file
  const retrievedResult = await fileService.getZkimFile(result.objectId ?? result.file.header.fileId);

  if (!retrievedResult.success || !retrievedResult.data) {
    console.error("Failed to retrieve file:", retrievedResult.error);
    return;
  }

  // Decrypt the file
  const decryptedData = await fileService.decryptZkimFile(
    retrievedResult.data,
    userId,
    userKey
  );

  const decryptedText = new TextDecoder().decode(decryptedData);
  console.log("✅ File decrypted successfully!");
  console.log("Decrypted content:", decryptedText);

  // Verify the decrypted content matches the original
  const originalText = new TextDecoder().decode(testData);
  if (decryptedText === originalText) {
    console.log("✅ Content verification: PASSED");
  } else {
    console.log("❌ Content verification: FAILED");
  }

  // Cleanup
  await fileService.cleanup();
}

// Run the example
main().catch((error) => {
  console.error("Example failed:", error);
  process.exit(1);
});

