/**
 * Authentication Integration Examples for @zkim-platform/file-format
 * 
 * This example demonstrates how to integrate the package with different
 * authentication methods (wallet, OAuth, email/password, etc.)
 * 
 * ⚠️ IMPORTANT: Never use random keys in production.
 * Always derive keys from actual user authentication.
 */

import {
  ZKIMFileService,
  InMemoryStorage,
  defaultLogger,
  type IStorageBackend,
  type ZkimFileMetadata,
} from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

// ============================================================================
// Key Derivation Utilities
// ============================================================================

/**
 * Generic key derivation function
 * Works with any authentication method
 */
async function deriveUserKey(
  userId: string,
  authCredential: string
): Promise<Uint8Array> {
  await sodium.ready;
  const input = `${userId}:${authCredential}`;
  return blake3(new TextEncoder().encode(input), { dkLen: 32 });
}

// ============================================================================
// Example 1: Wallet-Based Authentication
// ============================================================================

/**
 * Wallet-based authentication example
 * Works with Ethereum, Web3 wallets, etc.
 */
async function walletAuthExample() {
  await sodium.ready;

  // Simulate wallet authentication
  const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";
  const signature = "0xabcdef123456..."; // Wallet signature

  // Derive user key from wallet
  const userId = walletAddress; // Use wallet address as user ID
  const userKey = await deriveUserKey(userId, signature);

  // Platform key (store securely in production)
  const platformKey = sodium.randombytes_buf(32);

  // Create storage and service
  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, defaultLogger, storage);
  await fileService.initialize();

  // Create file with wallet authentication
  const data = new TextEncoder().encode("File encrypted with wallet auth");
  const result = await fileService.createZkimFile(
    data,
    userId,
    platformKey,
    userKey,
    {
      fileName: "wallet-file.txt",
      mimeType: "text/plain",
    }
  );

  if (result.success && result.file) {
    console.log("✅ File created with wallet authentication");
    console.log("File ID:", result.file.header.fileId);
  }

  // Decrypt file (requires same wallet signature)
  const fileResult = await fileService.getZkimFile(result.file.header.fileId);
  if (fileResult.success && fileResult.data) {
    const decrypted = await fileService.decryptZkimFile(
      fileResult.data,
      userId,
      userKey // Same key derived from same signature
    );
    console.log("✅ File decrypted:", new TextDecoder().decode(decrypted));
  }

  await fileService.cleanup();
}

// ============================================================================
// Example 2: OAuth-Based Authentication (Google, Auth0, etc.)
// ============================================================================

/**
 * OAuth-based authentication example
 * Works with Google, Auth0, Microsoft, etc.
 */
async function oauthAuthExample() {
  await sodium.ready;

  // Simulate OAuth authentication
  const googleUser = {
    sub: "google-user-id-123", // OAuth subject (unique user ID)
    email: "user@gmail.com",
    idToken: "eyJhbGciOiJSUzI1NiIs...", // OAuth ID token
  };

  // Derive user key from OAuth token
  const userId = googleUser.sub; // Use OAuth subject as user ID
  const userKey = await deriveUserKey(userId, googleUser.idToken);

  // Platform key
  const platformKey = sodium.randombytes_buf(32);

  // Create storage and service
  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, defaultLogger, storage);
  await fileService.initialize();

  // Create file with OAuth authentication
  const data = new TextEncoder().encode("File encrypted with OAuth auth");
  const result = await fileService.createZkimFile(
    data,
    userId,
    platformKey,
    userKey,
    {
      fileName: "oauth-file.txt",
      mimeType: "text/plain",
    }
  );

  if (result.success && result.file) {
    console.log("✅ File created with OAuth authentication");
  }

  await fileService.cleanup();
}

// ============================================================================
// Example 3: Email/Password Authentication
// ============================================================================

/**
 * Email/password authentication example
 * Uses Argon2id for password-based key derivation
 * 
 * Note: This is a simplified example. In production, use proper
 * Argon2id implementation via Web Worker to prevent UI blocking.
 */
async function emailPasswordAuthExample() {
  await sodium.ready;

  // Simulate email/password authentication
  const userEmail = "user@example.com";
  const password = "user-password-123";
  
  // In production, use Argon2id for password-based key derivation
  // This example uses BLAKE3 for simplicity (not recommended for passwords)
  const userId = userEmail;
  const passwordHash = await blake3(new TextEncoder().encode(password), { dkLen: 32 });
  const userKey = await deriveUserKey(userId, sodium.to_base64(passwordHash));

  // Platform key
  const platformKey = sodium.randombytes_buf(32);

  // Create storage and service
  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, defaultLogger, storage);
  await fileService.initialize();

  // Create file with email/password authentication
  const data = new TextEncoder().encode("File encrypted with email/password auth");
  const result = await fileService.createZkimFile(
    data,
    userId,
    platformKey,
    userKey,
    {
      fileName: "email-file.txt",
      mimeType: "text/plain",
    }
  );

  if (result.success && result.file) {
    console.log("✅ File created with email/password authentication");
  }

  await fileService.cleanup();
}

// ============================================================================
// Example 4: Unified Multi-Auth Service
// ============================================================================

/**
 * Unified service supporting multiple authentication methods
 * This pattern allows your application to support different auth methods
 */
class UnifiedFileService {
  private fileService: ZKIMFileService;
  private platformKey: Uint8Array;

  constructor(storage: IStorageBackend) {
    this.fileService = new ZKIMFileService({}, defaultLogger, storage);
    // Load platform key from secure storage
    this.platformKey = sodium.randombytes_buf(32); // In production, load from KMS
  }

  /**
   * Derive user key from authentication
   */
  private async deriveUserKey(
    userId: string,
    authCredential: string
  ): Promise<Uint8Array> {
    return deriveUserKey(userId, authCredential);
  }

  /**
   * Create file with any authentication method
   */
  async createFile(
    data: Uint8Array,
    auth: {
      method: "wallet" | "oauth" | "password" | "jwt";
      userId: string;
      credential: string; // Signature, token, password hash, etc.
    },
    metadata?: Partial<ZkimFileMetadata>
  ) {
    const userKey = await this.deriveUserKey(auth.userId, auth.credential);

    return await this.fileService.createZkimFile(
      data,
      auth.userId,
      this.platformKey,
      userKey,
      metadata
    );
  }

  /**
   * Download file with any authentication method
   */
  async downloadFile(
    fileId: string,
    auth: {
      method: "wallet" | "oauth" | "password" | "jwt";
      userId: string;
      credential: string;
    }
  ) {
    const userKey = await this.deriveUserKey(auth.userId, auth.credential);

    const fileResult = await this.fileService.getZkimFile(fileId);
    if (!fileResult.success || !fileResult.data) {
      throw new Error("File not found");
    }

    return await this.fileService.decryptZkimFile(
      fileResult.data,
      auth.userId,
      userKey
    );
  }
}

// Usage examples:
async function unifiedServiceExample() {
  const storage = new InMemoryStorage();
  const unifiedService = new UnifiedFileService(storage);
  await unifiedService.fileService.initialize();

  const data = new TextEncoder().encode("Test file");

  // Wallet auth
  await unifiedService.createFile(
    data,
    {
      method: "wallet",
      userId: "0x1234...",
      credential: "wallet-signature",
    },
    { fileName: "wallet-file.txt" }
  );

  // OAuth auth
  await unifiedService.createFile(
    data,
    {
      method: "oauth",
      userId: "google-user-123",
      credential: "oauth-id-token",
    },
    { fileName: "oauth-file.txt" }
  );

  // Password auth
  await unifiedService.createFile(
    data,
    {
      method: "password",
      userId: "user@example.com",
      credential: "password-hash",
    },
    { fileName: "password-file.txt" }
  );

  await unifiedService.fileService.cleanup();
}

// ============================================================================
// Main Example Runner
// ============================================================================

async function main() {
  console.log("=== Authentication Integration Examples ===\n");

  try {
    console.log("1. Wallet Authentication Example:");
    await walletAuthExample();
    console.log();

    console.log("2. OAuth Authentication Example:");
    await oauthAuthExample();
    console.log();

    console.log("3. Email/Password Authentication Example:");
    await emailPasswordAuthExample();
    console.log();

    console.log("4. Unified Multi-Auth Service Example:");
    await unifiedServiceExample();
    console.log();

    console.log("✅ All authentication examples completed successfully!");
  } catch (error) {
    console.error("❌ Example failed:", error);
    process.exit(1);
  }
}

// Run examples
if (require.main === module) {
  main().catch(console.error);
}

export {
  walletAuthExample,
  oauthAuthExample,
  emailPasswordAuthExample,
  UnifiedFileService,
};

