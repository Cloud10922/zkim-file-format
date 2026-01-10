<p align="center">
  <img src="./zkim-logo.png" alt="ZKIM" width="120" height="120" />
</p>

<h1 align="center">@zkim-platform/file-format</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@zkim-platform/file-format"><img src="https://img.shields.io/npm/v/@zkim-platform/file-format" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@zkim-platform/file-format"><img src="https://img.shields.io/npm/dm/@zkim-platform/file-format" alt="npm downloads" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20%2B-green" alt="Node.js" /></a>
  <img src="https://img.shields.io/badge/coverage-92%25-brightgreen" alt="Test Coverage" />
  <a href="https://github.com/zkdotim/zkim-file-format/actions/workflows/ci.yml"><img src="https://github.com/zkdotim/zkim-file-format/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build Status" /></a>
</p>

<p align="center">
  Post-quantum secure file format with three-layer encryption, ML-KEM-768/ML-DSA-65 cryptography, and privacy-preserving search.
</p>

---

Protect your files against future quantum computer attacks. Built on NIST-standardized cryptography (FIPS 203/204) with an auditable, open-source design and verifiable builds.

## Installation

```bash
npm install @zkim-platform/file-format
```

### Requirements

- Node.js 20+ (for Node.js environments)
- Modern browser with TypedArray and ES2020+ support (for browser environments)
  - Browser builds rely on WebAssembly-backed libsodium (via `libsodium-wrappers-sumo`)
- TypeScript 5.0+ (recommended for type safety)

## Quick Start

```typescript
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

async function main() {
  await sodium.ready;

  // ⚠️ NOTE: This example uses random keys for simplicity.
  // In production, derive keys from actual user authentication.
  // See Authentication Integration guide for proper key derivation.
  
  // Platform key (store securely, same for all users)
  const platformKey = sodium.randombytes_buf(32);
  
  // User key (in production, derive from user authentication)
  // Example: const userKey = await deriveKeyFromWallet(walletAddress, signature);
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
    undefined,
    storage
  );

  await fileService.initialize();

  try {
    // Create encrypted ZKIM file
    const testData = new TextEncoder().encode("Hello, ZKIM File Format!");
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

    if (result.success && result.file) {
      console.log("File created:", result.file.header.fileId);
    }
  } catch (error) {
    console.error("Failed to create file:", error);
  }

  await fileService.cleanup();
}

main().catch(console.error);
```

## Who is this for?

- Developers building secure file storage or sharing systems
- Applications requiring long-term confidentiality (store-now-decrypt-later resistance)
- Projects that need post-quantum signatures and crypto agility
- Teams concerned about supply-chain security and provenance

## Documentation

📖 **[Full Documentation → Wiki](https://github.com/zkdotim/zkim-file-format/wiki)**

- [Getting Started](https://github.com/zkdotim/zkim-file-format/wiki/Getting-Started)
- [Authentication Integration](https://github.com/zkdotim/zkim-file-format/wiki/Authentication-Integration) ⭐ **CRITICAL**
- [Storage Integration](https://github.com/zkdotim/zkim-file-format/wiki/Storage-Integration) ⭐ **CRITICAL**
- [API Reference](https://github.com/zkdotim/zkim-file-format/wiki/API-Reference)
- [Examples](https://github.com/zkdotim/zkim-file-format/wiki/Examples)
- [Security & Post-Quantum](https://github.com/zkdotim/zkim-file-format/wiki/Security)
- [Architecture](https://github.com/zkdotim/zkim-file-format/wiki/Architecture)
- [Troubleshooting](https://github.com/zkdotim/zkim-file-format/wiki/Troubleshooting)

## Features

- 🔐 **Three-Layer Encryption**: XChaCha20-Poly1305 with platform, user, and content layers
- 🔍 **Privacy-Preserving Search**: OPRF-based trapdoors with rotation
- ✅ **Post-Quantum Signatures**: ML-DSA-65 (FIPS 204) for long-term authenticity
- 📦 **Compression**: Optional GZIP/Brotli compression
- 🛡️ **Integrity Validation**: BLAKE3-based content hashing and integrity verification
- 🌐 **Cross-Platform**: Works in browser and Node.js environments

**⚠️ FIPS Validation Disclaimer:** This package uses NIST-standardized algorithms (FIPS 203/204) but is **NOT FIPS 140-3 validated** by an accredited laboratory. The implementation follows NIST specifications but is not certified for government use requiring FIPS validation. See [Security Documentation](https://github.com/zkdotim/zkim-file-format/wiki/Security) for details.

## Key Technologies

- **Encryption**: XChaCha20-Poly1305 (AEAD) via libsodium
- **Hashing**: BLAKE3 (256-bit output) via @noble/hashes
- **Signatures**: ML-DSA-65 (FIPS 204, post-quantum) via @noble/post-quantum
- **Key Exchange**: ML-KEM-768 (FIPS 203, post-quantum) via @noble/post-quantum
- **Searchable Encryption**: OPRF (Oblivious Pseudorandom Function) via @noble/curves

## Design Philosophy

- **Post-quantum by default** - Future-proof cryptography from day one
- **Crypto agility** - Algorithm choices are explicit and configurable
- **Explicit threat models** - Security assumptions are documented
- **Auditability over obscurity** - Open design and verifiable builds

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Provenance

This package is published with **npm Provenance** (build attestation) to ensure authenticity and integrity.

**What is Provenance?**
Provenance provides verifiable information about how and where this package was built:
- ✅ **Built and signed on:** GitHub Actions
- ✅ **Source Commit:** Links to exact GitHub commit
- ✅ **Build File:** Links to GitHub Actions workflow
- ✅ **Public Ledger:** Transparency log entry (immutable record)

**Why it matters:**
- Verifies package authenticity
- Shows exact source code used
- Provides build environment details
- Creates immutable audit trail
- Enhances supply chain security

**View Provenance:**
Visit the package page on npm and scroll to the "Provenance" section at the bottom to see:
- Build environment details
- Source commit link
- Build workflow file
- Public ledger entry

**Verify locally:**
```bash
npm audit signatures
```

For more information, see [npm Provenance Documentation](https://docs.npmjs.com/generating-provenance-statements/).

---

**Made with ❤️ by the ZKIM Team**
