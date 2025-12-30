# Release v1.0.0 - Initial Release

**Release Date:** December 30, 2025

## 🎉 First Public Release

We're excited to announce the initial release of `@zkim-platform/file-format`, a secure, encrypted file format with three-layer encryption, integrity validation, and privacy-preserving search capabilities.

## ✨ Key Features

### 🔐 Three-Layer Encryption
- **Platform Layer**: Encrypted with platform key
- **User Layer**: Encrypted with user key
- **Content Layer**: Encrypted with derived content key
- Uses XChaCha20-Poly1305 (AEAD) for all encryption layers

### 🔍 Privacy-Preserving Search
- OPRF-based trapdoor generation
- Automatic trapdoor rotation
- Privacy-preserving query batching
- Search result padding for privacy

### ✅ Integrity Validation
- BLAKE3-based integrity checks
- Ed25519 signature verification
- Tampering detection
- Chunk-level validation

### 🛡️ Error Recovery
- Corruption detection
- Automatic recovery strategies
- File structure repair
- Validation and repair workflows

### 📦 Additional Features
- Optional GZIP/Brotli compression
- Performance monitoring
- Constant-time security operations
- Cross-platform support (Node.js & Browser)

## 📊 Test Coverage

- **1,307 tests** passing (2 skipped, 0 failing)
- **92.09%** statement coverage
- **82.15%** branch coverage
- **95.83%** function coverage
- **92.16%** line coverage

## 📚 Documentation

- Comprehensive README with full API reference
- 7 working examples covering all use cases
- CONTRIBUTING.md with contribution guidelines
- Full TypeScript type definitions

## 🔒 Security

- **Web Crypto API Prohibition**: Uses libsodium-wrappers-sumo exclusively
- **BLAKE3 Hashing**: Standard ZKIM hash algorithm
- **Secure Key Management**: Proper key derivation and rotation
- **Constant-Time Operations**: Timing attack prevention

## 🚀 Getting Started

```bash
npm install @zkim-platform/file-format
```

```typescript
import { ZKIMFileService, InMemoryStorage, defaultLogger } from "@zkim-platform/file-format";
import sodium from "libsodium-wrappers-sumo";

await sodium.ready;
const platformKey = sodium.randombytes_buf(32);
const userKey = sodium.randombytes_buf(32);

const fileService = new ZKIMFileService(
  { enableCompression: true, enableIntegrityValidation: true },
  defaultLogger,
  new InMemoryStorage()
);

await fileService.initialize();

// Create encrypted file
const result = await fileService.createZkimFile(
  new TextEncoder().encode("Hello, ZKIM!"),
  "user-id",
  platformKey,
  userKey,
  { fileName: "example.txt", mimeType: "text/plain" }
);
```

## 📖 Documentation

- [Full Documentation](https://github.com/zkdotim/zkim-file-format#readme)
- [API Reference](https://github.com/zkdotim/zkim-file-format#api-reference)
- [Examples](https://github.com/zkdotim/zkim-file-format/tree/main/examples)
- [Contributing Guide](https://github.com/zkdotim/zkim-file-format/blob/main/CONTRIBUTING.md)

## 🔗 Links

- **Repository**: https://github.com/zkdotim/zkim-file-format
- **npm Package**: https://www.npmjs.com/package/@zkim-platform/file-format
- **Issue Tracker**: https://github.com/zkdotim/zkim-file-format/issues
- **Discussions**: https://github.com/zkdotim/zkim-file-format/discussions

## 🙏 Acknowledgments

Thank you to all contributors and the ZKIM team for making this release possible!

---

**Full Changelog**: https://github.com/zkdotim/zkim-file-format/compare/initial-commit...v1.0.0

