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

  // ⚠️ NOTE: In production, use createZkimFile() which handles the full post-quantum workflow.
  // This example demonstrates the complete ML-KEM-768 key derivation process.

  // Create content to encrypt
  const originalContent = new TextEncoder().encode(
    "This is sensitive data that requires three-layer encryption."
  );

  // Step 1: Create a ZKIM file with post-quantum encryption
  // createZkimFile() automatically handles the full post-quantum workflow:
  // 1. Generates ML-KEM-768 key pair for post-quantum key exchange
  // 2. Encapsulates shared secret using self-encryption pattern
  // 3. Derives platform key: blake3([sharedSecret, ...platformKey], { dkLen: 32 })
  // 4. Derives user key: blake3([sharedSecret, ...userKey], { dkLen: 32 })
  // 5. Encrypts with three-layer encryption (platform/user/content layers)
  // 6. Generates random content key for perfect forward secrecy
  // 7. Stores ML-KEM secret key encrypted with user key for future decryption
  // 8. Includes KEM ciphertext in wire format for key exchange
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

  // Step 2: Demonstrate decryption process
  // The high-level decryptZkimFile method handles the full post-quantum workflow:
  // 1. Retrieves ML-KEM secret key from storage (encrypted with user key)
  // 2. Decapsulates shared secret from KEM ciphertext in wire format
  // 3. Derives platform and user keys from ML-KEM shared secret
  // 4. Decrypts user layer to get content key (content key is NOT stored in metadata)
  // 5. Decrypts content layer with content key
  // 6. Decompresses and reconstructs original data
  const retrievedResult = await fileService.getZkimFile(
    fileResult.objectId ?? zkimFile.header.fileId
  );

  if (retrievedResult.success && retrievedResult.data) {
    // Decrypt using post-quantum key derivation
    // decryptZkimFile() automatically:
    // - Retrieves ML-KEM secret key from storage
    // - Decapsulates shared secret from KEM ciphertext
    // - Derives platform and user keys
    // - Decrypts all three layers
    const highLevelDecrypted = await fileService.decryptZkimFile(
      retrievedResult.data,
      userId,
      userKey
    );

    const originalText = new TextDecoder().decode(originalContent);
    const highLevelText = new TextDecoder().decode(highLevelDecrypted);
    if (highLevelText === originalText) {
      console.log("✅ Post-quantum encryption/decryption successful!");
      console.log("   - ML-KEM-768 key exchange: ✅");
      console.log("   - Platform key derivation: ✅");
      console.log("   - User key derivation: ✅");
      console.log("   - Content key (random): ✅");
      console.log("   - Three-layer decryption: ✅");
    }
  }

  // Cleanup
  await fileService.cleanup();
}

// Run the example
main().catch((error) => {
  // Handle error appropriately
  throw error;
});

