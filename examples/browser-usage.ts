/**
 * Browser Usage Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to use @zkim-platform/file-format in a browser:
 * 1. Using browser localStorage for storage
 * 2. Working with File API for file uploads
 * 3. Browser-specific error handling
 * 4. Downloading encrypted/decrypted files
 * 
 * Note: This example is designed for browser environments
 * Run this in a browser console or include in an HTML page
 */

import {
  ZKIMFileService,
  LocalStorageBackend,
  defaultLogger,
} from "../src/index";
// libsodium-wrappers-sumo uses default export, not namespace export
// @ts-expect-error - libsodium-wrappers-sumo has incorrect type definitions
import sodium from "libsodium-wrappers-sumo";

/**
 * Browser File Storage Backend
 * Uses browser localStorage for persistence
 */
async function main() {
  // Check if running in browser
  if (typeof window === "undefined") {
    throw new Error("This example requires a browser environment");
  }

  // Wait for libsodium to be ready
  await sodium.ready;

  // Generate encryption keys
  // In a real application, these should be derived from user credentials
  const platformKey = sodium.randombytes_buf(32);
  const userKey = sodium.randombytes_buf(32);
  const userId = "browser-user";

  // Create browser localStorage storage backend
  const storage = new LocalStorageBackend();

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

  // Example 1: Encrypt text content
  const textContent = new TextEncoder().encode("Hello from browser!");
  const result = await fileService.createZkimFile(
    textContent,
    userId,
    platformKey,
    userKey,
    {
      fileName: "browser-doc.txt",
      mimeType: "text/plain",
    }
  );

  if (!result.success || !result.file) {
    throw new Error("Failed to create encrypted file");
  }

  // File encrypted and stored in localStorage
  const fileId = result.file.header.fileId;
  const objectId = result.objectId;

  // Example 2: Handle file upload from user
  // This would typically be triggered by a file input element
  function handleFileUpload(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const fileContent = new Uint8Array(arrayBuffer);

          const uploadResult = await fileService.createZkimFile(
            fileContent,
            userId,
            platformKey,
            userKey,
            {
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
            }
          );

          if (uploadResult.success) {
            // File encrypted and stored
            resolve();
          } else {
            reject(new Error("Failed to encrypt file"));
          }
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // Example 3: Retrieve and decrypt file
  const retrievedResult = await fileService.getZkimFile(
    objectId ?? fileId
  );

  if (retrievedResult.success && retrievedResult.data) {
    const decrypted = await fileService.decryptZkimFile(
      retrievedResult.data,
      userId,
      userKey
    );

    // Verify content
    const originalText = new TextDecoder().decode(textContent);
    const decryptedText = new TextDecoder().decode(decrypted);
    if (originalText === decryptedText) {
      // Content verified successfully
    }
  }

  // Example 4: Download decrypted file
  function downloadFile(data: Uint8Array, fileName: string, mimeType: string): void {
    // Convert Uint8Array to ArrayBuffer for Blob
    const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Example 5: List all stored files
  const storedFiles = await storage.keys();
  // List of stored file keys: storedFiles

  // Example 6: Delete a file
  if (objectId) {
    await storage.delete(objectId);
  }

  // Example 7: Export encrypted file for backup
  if (retrievedResult.success && retrievedResult.data) {
    const encryptedData = new TextEncoder().encode(
      JSON.stringify(retrievedResult.data)
    );
    downloadFile(encryptedData, "encrypted-backup.zkim", "application/octet-stream");
  }

  // Cleanup
  await fileService.cleanup();
}

// Export for use in browser
if (typeof window !== "undefined") {
  (window as unknown as { zkimFileFormatExample: typeof main }).zkimFileFormatExample = main;
}

// Run the example if executed directly
if (typeof window !== "undefined") {
  main().catch((error) => {
    // Handle error appropriately
    throw error;
  });
}

