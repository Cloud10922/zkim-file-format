/**
 * Encryption/Decryption Workflow Example for @zkim-platform/file-format
 * 
 * This example demonstrates the detailed encryption and decryption workflow:
 * 1. Three-layer encryption process
 * 2. Key management and derivation
 * 3. Decryption with proper key handling
 * 4. Working with encrypted chunks
 */

import {
  ZKIMFileService,
  ZkimEncryption,
  InMemoryStorage,
  defaultLogger,
} from "../src/index";
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

  // Get the encryption service
  const encryptionService = await ZkimEncryption.getServiceInstance();

  // Create content to encrypt
  const originalContent = new TextEncoder().encode(
    "This is sensitive data that requires three-layer encryption."
  );

  // Step 1: Encrypt the data using three-layer encryption
  const encryptionResult = await encryptionService.encryptData(
    originalContent,
    platformKey,
    userKey,
    "file-123",
    {
      fileName: "sensitive-doc.txt",
      mimeType: "text/plain",
    }
  );

  // Encryption result contains:
  // - platformEncrypted: First layer (platform key)
  // - userEncrypted: Second layer (user key)
  // - contentEncrypted: Third layer (content key)
  // - nonces: Array of nonces used for each layer
  // - metadata: Encryption metadata

  // Step 2: Create a ZKIM file with the encrypted data
  const fileResult = await fileService.createZkimFile(
    originalContent,
    userId,
    platformKey,
    userKey,
    {
      fileName: "sensitive-doc.txt",
      mimeType: "text/plain",
    }
  );

  if (!fileResult.success || !fileResult.file) {
    throw new Error("Failed to create file");
  }

  const zkimFile = fileResult.file;

  // Step 3: Demonstrate decryption process
  // The high-level decryptZkimFile method handles all layers automatically
  // For manual decryption, you would need to:
  // 1. Extract userEncrypted and userNonce from customFields
  // 2. Decrypt user layer to get contentKey
  // 3. Decrypt content layer with contentKey

  // Step 4: Demonstrate using the high-level decryptZkimFile method
  // This is the recommended approach as it handles all layers automatically
  const retrievedResult = await fileService.getZkimFile(
    fileResult.objectId ?? zkimFile.header.fileId
  );

  if (retrievedResult.success && retrievedResult.data) {
    const highLevelDecrypted = await fileService.decryptZkimFile(
      retrievedResult.data,
      userId,
      userKey
    );

    const originalText = new TextDecoder().decode(originalContent);
    const highLevelText = new TextDecoder().decode(highLevelDecrypted);
    if (highLevelText === originalText) {
      // High-level decryption successful
    }
  }

  // Cleanup
  await fileService.cleanup();
  await encryptionService.cleanup();
}

// Run the example
main().catch((error) => {
  // Handle error appropriately
  throw error;
});

