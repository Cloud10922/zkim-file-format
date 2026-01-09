# Authentication Integration

Complete guide for integrating `@zkim-platform/file-format` with different authentication systems. The package is **authentication-agnostic** and works with any authentication method.

---

## Overview

### Authentication-Agnostic Design

`@zkim-platform/file-format` does **not** depend on any specific authentication method. It only requires:

1. **`userId`** - Any string identifier (wallet address, email, UUID, etc.)
2. **`userKey`** - A 32-byte encryption key derived from user authentication
3. **`platformKey`** - A 32-byte encryption key (platform-wide)

**Key Principle:** Files are bound to users through **encryption**, not through the authentication method itself.

---

## Core Concepts

### User Identity (`userId`)

The `userId` parameter can be **any unique string identifier**:

- **Wallet Address:** `"0x1234567890abcdef1234567890abcdef12345678"`
- **Email:** `"user@example.com"`
- **OAuth Subject:** `"google-oauth-subject-123"`
- **UUID:** `"550e8400-e29b-41d4-a716-446655440000"`
- **Username:** `"john_doe"`
- **Any unique identifier:** Your choice!

### User Key (`userKey`)

The `userKey` must be:
- **32 bytes** (256 bits)
- **Deterministic** - Same user + same auth = same key
- **Derived from authentication** - Not random!

**⚠️ CRITICAL:** Never use random keys in production. Keys must be derived from actual user authentication so the same user can decrypt their files later.

### Platform Key (`platformKey`)

The `platformKey` is a platform-wide encryption key:
- **32 bytes** (256 bits)
- **Same for all users** on your platform
- **Stored securely** (key management service, HSM, etc.)

---

## Key Derivation Strategies

### Strategy 1: Deterministic Key from User Credentials

Derive a key from user authentication credentials:

```typescript
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

async function deriveKeyFromCredentials(
  userId: string,
  userSecret: string // Password hash, OAuth token, wallet signature, etc.
): Promise<Uint8Array> {
  await sodium.ready;
  const input = `${userId}:${userSecret}`;
  return blake3(new TextEncoder().encode(input), { dkLen: 32 });
}
```

### Strategy 2: Password-Based Key Derivation (Argon2id)

For password-based authentication, use Argon2id:

```typescript
import { Argon2idWorkerService } from "./argon2-worker"; // Your implementation

async function deriveKeyFromPassword(
  userId: string,
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  // Use Argon2id for password-based key derivation
  return await Argon2idWorkerService.deriveKey(password, salt, {
    iterations: 100000,
    memory: 65536,
  });
}
```

### Strategy 3: Key from Cryptographic Signature

For wallet-based or signature-based auth:

```typescript
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

async function deriveKeyFromSignature(
  userId: string,
  signature: string
): Promise<Uint8Array> {
  await sodium.ready;
  const input = `${userId}:${signature}`;
  return blake3(new TextEncoder().encode(input), { dkLen: 32 });
}
```

---

## Authentication Method Examples

### 1. Wallet-Based Authentication (Ethereum, Web3)

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

class WalletAuthIntegration {
  private fileService: ZKIMFileService;
  private platformKey: Uint8Array;

  constructor(storage: IStorageBackend) {
    this.fileService = new ZKIMFileService({}, undefined, storage);
    // Load platform key from secure storage
    this.platformKey = await this.loadPlatformKey();
  }

  /**
   * Derive user key from wallet address and signature
   */
  async deriveKeyFromWallet(
    walletAddress: string,
    signature: string
  ): Promise<Uint8Array> {
    await sodium.ready;
    const input = `${walletAddress}:${signature}`;
    return blake3(new TextEncoder().encode(input), { dkLen: 32 });
  }

  /**
   * Create file with wallet authentication
   */
  async createFileWithWallet(
    data: Uint8Array,
    walletAddress: string,
    signature: string,
    metadata?: Partial<ZkimFileMetadata>
  ) {
    const userId = walletAddress; // Use wallet address as user ID
    const userKey = await this.deriveKeyFromWallet(walletAddress, signature);

    return await this.fileService.createZkimFile(
      data,
      userId,
      this.platformKey,
      userKey,
      metadata
    );
  }

  /**
   * Download file with wallet authentication
   */
  async downloadFileWithWallet(
    fileId: string,
    walletAddress: string,
    signature: string
  ) {
    const userId = walletAddress;
    const userKey = await this.deriveKeyFromWallet(walletAddress, signature);

    // Get file first
    const fileResult = await this.fileService.getZkimFile(fileId);
    if (!fileResult.success || !fileResult.data) {
      throw new Error("File not found");
    }

    // Decrypt with user key
    return await this.fileService.decryptZkimFile(
      fileResult.data,
      userId,
      userKey
    );
  }
}
```

### 2. Google OAuth / OAuth Providers

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";
import { GoogleAuth } from "google-auth-library";

class OAuthAuthIntegration {
  private fileService: ZKIMFileService;
  private platformKey: Uint8Array;

  constructor(storage: IStorageBackend) {
    this.fileService = new ZKIMFileService({}, undefined, storage);
    this.platformKey = await this.loadPlatformKey();
  }

  /**
   * Derive user key from OAuth token
   */
  async deriveKeyFromOAuth(
    userId: string,
    idToken: string
  ): Promise<Uint8Array> {
    await sodium.ready;
    const input = `${userId}:${idToken}`;
    return blake3(new TextEncoder().encode(input), { dkLen: 32 });
  }

  /**
   * Create file with Google OAuth
   */
  async createFileWithGoogle(
    data: Uint8Array,
    googleUser: {
      email: string;
      idToken: string;
      sub: string; // Google user ID
    },
    metadata?: Partial<ZkimFileMetadata>
  ) {
    // Use Google user ID (sub) or email as userId
    const userId = googleUser.sub; // or googleUser.email
    const userKey = await this.deriveKeyFromOAuth(userId, googleUser.idToken);

    return await this.fileService.createZkimFile(
      data,
      userId,
      this.platformKey,
      userKey,
      metadata
    );
  }

  /**
   * Download file with Google OAuth
   */
  async downloadFileWithGoogle(
    fileId: string,
    googleUser: {
      sub: string;
      idToken: string;
    }
  ) {
    const userId = googleUser.sub;
    const userKey = await this.deriveKeyFromOAuth(userId, googleUser.idToken);

    const fileResult = await this.fileService.getZkimFile(fileId);
    if (!fileResult.success || !fileResult.data) {
      throw new Error("File not found");
    }

    return await this.fileService.decryptZkimFile(
      fileResult.data,
      userId,
      userKey
    );
  }
}
```

### 3. Email/Password Authentication

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { Argon2idWorkerService } from "./argon2-worker"; // Your implementation
import sodium from "libsodium-wrappers-sumo";

class EmailPasswordAuthIntegration {
  private fileService: ZKIMFileService;
  private platformKey: Uint8Array;

  constructor(storage: IStorageBackend) {
    this.fileService = new ZKIMFileService({}, undefined, storage);
    this.platformKey = await this.loadPlatformKey();
  }

  /**
   * Derive user key from password using Argon2id
   */
  async deriveKeyFromPassword(
    userId: string,
    password: string,
    salt: Uint8Array
  ): Promise<Uint8Array> {
    // Use Argon2id for password-based key derivation
    return await Argon2idWorkerService.deriveKey(password, salt, {
      iterations: 100000,
      memory: 65536,
    });
  }

  /**
   * Get or create salt for user
   */
  async getOrCreateSalt(userId: string): Promise<Uint8Array> {
    // Retrieve salt from secure storage, or generate new one
    const storedSalt = await this.getSaltFromStorage(userId);
    if (storedSalt) {
      return storedSalt;
    }

    // Generate new salt
    await sodium.ready;
    const salt = sodium.randombytes_buf(32);
    await this.saveSaltToStorage(userId, salt);
    return salt;
  }

  /**
   * Create file with email/password authentication
   */
  async createFileWithEmailPassword(
    data: Uint8Array,
    userId: string,
    password: string,
    metadata?: Partial<ZkimFileMetadata>
  ) {
    const salt = await this.getOrCreateSalt(userId);
    const userKey = await this.deriveKeyFromPassword(userId, password, salt);

    return await this.fileService.createZkimFile(
      data,
      userId,
      this.platformKey,
      userKey,
      metadata
    );
  }

  /**
   * Download file with email/password authentication
   */
  async downloadFileWithEmailPassword(
    fileId: string,
    userId: string,
    password: string
  ) {
    const salt = await this.getOrCreateSalt(userId);
    const userKey = await this.deriveKeyFromPassword(userId, password, salt);

    const fileResult = await this.fileService.getZkimFile(fileId);
    if (!fileResult.success || !fileResult.data) {
      throw new Error("File not found");
    }

    return await this.fileService.decryptZkimFile(
      fileResult.data,
      userId,
      userKey
    );
  }
}
```

### 4. JWT / Session-Based Authentication

```typescript
import { ZKIMFileService } from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";
import jwt from "jsonwebtoken";

class JWTAuthIntegration {
  private fileService: ZKIMFileService;
  private platformKey: Uint8Array;
  private jwtSecret: string;

  constructor(storage: IStorageBackend, jwtSecret: string) {
    this.fileService = new ZKIMFileService({}, undefined, storage);
    this.platformKey = await this.loadPlatformKey();
    this.jwtSecret = jwtSecret;
  }

  /**
   * Derive user key from JWT token
   */
  async deriveKeyFromJWT(
    userId: string,
    jwtToken: string
  ): Promise<Uint8Array> {
    await sodium.ready;
    const input = `${userId}:${jwtToken}`;
    return blake3(new TextEncoder().encode(input), { dkLen: 32 });
  }

  /**
   * Create file with JWT authentication
   */
  async createFileWithJWT(
    data: Uint8Array,
    jwtToken: string,
    metadata?: Partial<ZkimFileMetadata>
  ) {
    // Verify and decode JWT
    const decoded = jwt.verify(jwtToken, this.jwtSecret) as { sub: string };
    const userId = decoded.sub; // JWT subject

    const userKey = await this.deriveKeyFromJWT(userId, jwtToken);

    return await this.fileService.createZkimFile(
      data,
      userId,
      this.platformKey,
      userKey,
      metadata
    );
  }
}
```

---

## Complete Integration Example

### Multi-Auth Support

```typescript
import { ZKIMFileService, IStorageBackend } from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

/**
 * Unified file service supporting multiple authentication methods
 */
class UnifiedFileService {
  private fileService: ZKIMFileService;
  private platformKey: Uint8Array;

  constructor(storage: IStorageBackend) {
    this.fileService = new ZKIMFileService({}, undefined, storage);
    this.platformKey = this.loadPlatformKey();
  }

  /**
   * Generic key derivation - works with any auth method
   */
  private async deriveUserKey(
    userId: string,
    authCredential: string
  ): Promise<Uint8Array> {
    await sodium.ready;
    const input = `${userId}:${authCredential}`;
    return blake3(new TextEncoder().encode(input), { dkLen: 32 });
  }

  /**
   * Create file - works with any authentication method
   */
  async createFile(
    data: Uint8Array,
    auth: {
      method: "wallet" | "oauth" | "password" | "jwt";
      userId: string;
      credential: string; // Signature, token, password, etc.
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
   * Download file - works with any authentication method
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

// Wallet auth
await unifiedService.createFile(
  data,
  {
    method: "wallet",
    userId: "0x1234...",
    credential: walletSignature,
  },
  metadata
);

// OAuth auth
await unifiedService.createFile(
  data,
  {
    method: "oauth",
    userId: googleUser.sub,
    credential: googleUser.idToken,
  },
  metadata
);

// Password auth
await unifiedService.createFile(
  data,
  {
    method: "password",
    userId: userEmail,
    credential: userPassword,
  },
  metadata
);
```

---

## Security Best Practices

### ✅ DO:

1. **Derive keys from actual authentication**
   ```typescript
   // ✅ GOOD: Derive from auth credentials
   const userKey = await deriveKeyFromWallet(walletAddress, signature);
   const userKey = await deriveKeyFromOAuth(userId, oauthToken);
   ```

2. **Use deterministic key derivation**
   - Same user + same auth = same key
   - Required for file decryption

3. **Store platform key securely**
   - Use key management service (AWS KMS, Azure Key Vault, etc.)
   - Never hardcode in source code
   - Use environment variables or secure storage

4. **Use strong key derivation**
   - BLAKE3 for deterministic keys
   - Argon2id for password-based keys
   - Never use weak hashing (MD5, SHA1, etc.)

### ❌ DON'T:

1. **Never use random keys in production**
   ```typescript
   // ❌ BAD: Random keys won't work for decryption
   const userKey = sodium.randombytes_buf(32);
   ```

2. **Never use package's default getUserKey()**
   ```typescript
   // ❌ BAD: Insecure - anyone with userId can derive key
   const userKey = await fileService.getUserKey(userId);
   ```

3. **Never store keys in plaintext**
   ```typescript
   // ❌ BAD: Plaintext storage
   localStorage.setItem("userKey", userKey.toString());
   
   // ✅ GOOD: Encrypted storage
   await SecureStorage.setItem("userKey", encryptedKey);
   ```

4. **Never share keys between users**
   - Each user must have unique key
   - Derived from their own authentication

---

## File Binding Mechanism

### How Files Are Bound to Users

Files are bound to users through **encryption**, not through authentication method:

1. **Encryption:** Files are encrypted with `userKey`
2. **Metadata:** `userId` is stored in file metadata
3. **Access Control:** Only users with correct `userKey` can decrypt

### Access Control Flow

```typescript
// 1. User authenticates (wallet, OAuth, password, etc.)
const authResult = await authenticateUser(credentials);

// 2. Derive user key from authentication
const userKey = await deriveKeyFromAuth(authResult.userId, authResult.credential);

// 3. Create file - encrypted with user key
const file = await fileService.createZkimFile(data, authResult.userId, platformKey, userKey);

// 4. Later: User authenticates again
const authResult2 = await authenticateUser(credentials);

// 5. Derive same key (deterministic)
const userKey2 = await deriveKeyFromAuth(authResult2.userId, authResult2.credential);

// 6. Decrypt file - only works if key matches
const decrypted = await fileService.decryptZkimFile(file, authResult2.userId, userKey2);
```

---

## Common Patterns

### Pattern 1: Key Caching

Cache derived keys during user session:

```typescript
class KeyCache {
  private cache = new Map<string, { key: Uint8Array; expires: number }>();

  async getOrDeriveKey(
    userId: string,
    credential: string,
    ttl = 3600000 // 1 hour
  ): Promise<Uint8Array> {
    const cacheKey = `${userId}:${credential}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.key;
    }

    const key = await deriveKeyFromAuth(userId, credential);
    this.cache.set(cacheKey, {
      key,
      expires: Date.now() + ttl,
    });

    return key;
  }
}
```

### Pattern 2: Key Rotation

Handle key rotation for password changes:

```typescript
async function rotateUserKey(
  userId: string,
  oldPassword: string,
  newPassword: string
) {
  // 1. Get all user's files
  const files = await getUserFiles(userId);

  // 2. Decrypt with old key
  const oldKey = await deriveKeyFromPassword(userId, oldPassword, salt);
  
  // 3. Re-encrypt with new key
  const newSalt = await generateNewSalt(userId);
  const newKey = await deriveKeyFromPassword(userId, newPassword, newSalt);

  for (const file of files) {
    const decrypted = await fileService.decryptZkimFile(file, userId, oldKey);
    await fileService.createZkimFile(decrypted, userId, platformKey, newKey, file.metadata);
  }
}
```

---

## Troubleshooting

### Issue: "Cannot decrypt file"

**Cause:** Wrong `userKey` - key doesn't match the one used for encryption.

**Solution:**
- Ensure key derivation is deterministic
- Use same authentication credentials
- Verify `userId` matches

### Issue: "File not found"

**Cause:** Wrong `fileId` or file not in storage.

**Solution:**
- Check `fileId` is correct
- Verify storage backend is working
- Check file exists in storage

### Issue: "Key derivation fails"

**Cause:** Authentication credentials changed or invalid.

**Solution:**
- Verify authentication is successful
- Check credential format matches derivation function
- Ensure salt is same for password-based auth

---

## See Also

- **[Getting Started](Getting-Started)** - Basic setup and installation
- **[Storage Integration](Storage-Integration)** - Storage backend integration
- **[API Reference](API-Reference)** - Complete API documentation
- **[Security](Security)** - Cryptographic details and best practices
- **[Examples](Examples)** - Code examples and patterns

---

**Last Updated:** 2026-01-09

