# @zkim-platform/file-format Wiki

Welcome to the comprehensive documentation for `@zkim-platform/file-format` - a secure, post-quantum encrypted file format with three-layer encryption, ML-DSA-65 signatures (FIPS 204), and privacy-preserving search capabilities.

## 📚 Documentation Index

### Getting Started
- **[Getting Started](Getting-Started.md)** - Installation, requirements, and your first ZKIM file

### Core Documentation
- **[Authentication Integration](Authentication-Integration.md)** ⭐ **CRITICAL** - How to integrate with any authentication system (wallet, OAuth, email/password, etc.)
- **[Storage Integration](Storage-Integration.md)** ⭐ **CRITICAL** - How to integrate with any storage backend (S3, Azure, GCS, IPFS, etc.)
- **[Recommended Configurations](Recommended-Configurations.md)** - Pre-configured settings for common use cases
- **[React & Next.js Integration](React-Nextjs-Integration.md)** - Complete integration guide for React and Next.js
- **[API Reference](API-Reference.md)** - Complete API documentation for all services and methods
- **[Architecture](Architecture.md)** - File format specification, wire format, and internal design

### Advanced Topics
- **[Security](Security.md)** - Post-quantum cryptography, ML-DSA-65, ML-KEM-768, threat model
- **[Examples](Examples.md)** - Code examples, use cases, and integration patterns

### Support
- **[Troubleshooting](Troubleshooting.md)** - Common issues, error codes, and solutions
- **[Contributing](Contributing.md)** - Development setup, code style, and PR process

---

## 🚀 Quick Navigation

### For New Users
1. Start with **[Getting Started](Getting-Started.md)** to install and create your first file
2. Read **[Authentication Integration](Authentication-Integration.md)** to connect your authentication system
3. Read **[Storage Integration](Storage-Integration.md)** to connect your storage backend
4. Check **[Examples](Examples.md)** for real-world usage patterns

### For Developers
1. Review **[Architecture](Architecture.md)** to understand the file format
2. Read **[API Reference](API-Reference.md)** for complete method documentation
3. See **[Security](Security.md)** for cryptographic details

### For Integrators
1. **[Authentication Integration](Authentication-Integration.md)** - Essential for connecting your auth system
2. **[Storage Integration](Storage-Integration.md)** - Essential for any storage backend
3. **[API Reference](API-Reference.md)** - Complete integration guide
4. **[Examples](Examples.md)** - Integration patterns and use cases

---

## 📦 Package Information

- **npm Package:** `@zkim-platform/file-format`
- **Version:** 1.0.0
- **License:** MIT
- **Repository:** [GitHub](https://github.com/zkdotim/zkim-file-format)
- **Issues:** [GitHub Issues](https://github.com/zkdotim/zkim-file-format/issues)

---

## 🔐 Key Features

- **Post-Quantum Cryptography:** ML-DSA-65 (FIPS 204) signatures, ML-KEM-768 (FIPS 203) key exchange
- **Three-Layer Encryption:** Platform, user, and content layers with XChaCha20-Poly1305
- **Privacy-Preserving Search:** OPRF-based trapdoors with rotation
- **Integrity Validation:** BLAKE3-based integrity checks and tamper detection
- **Storage Agnostic:** Works with any storage backend via `IStorageBackend` interface
- **Cross-Platform:** Browser and Node.js support

---

## 📖 Documentation Structure

This wiki is organized into focused pages:

- **Home** (this page) - Overview and navigation
- **Getting Started** - Quick start guide
- **Authentication Integration** - Connect any authentication system (wallet, OAuth, email/password, etc.)
- **Storage Integration** - Custom storage backends (S3, Azure, GCS, IPFS, etc.)
- **API Reference** - Complete API documentation
- **Examples** - Code examples and patterns
- **Security** - Cryptographic details and best practices
- **Architecture** - File format specification
- **Troubleshooting** - Common issues and solutions
- **Contributing** - Development guidelines

---

## 🆘 Need Help?

- **Issues:** [GitHub Issues](https://github.com/zkdotim/zkim-file-format/issues)
- **Discussions:** [GitHub Discussions](https://github.com/zkdotim/zkim-file-format/discussions)
- **Security:** [Security Policy](https://github.com/zkdotim/zkim-file-format/security/policy)

---

**Last Updated:** 2026-01-09

