# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2025-12-30

### Fixed
- Updated all package references from `@zkim/file-format` to `@zkim-platform/file-format` to match npm organization scope
- Fixed install command in documentation (`npm install @zkim-platform/file-format`)
- Updated all code examples and documentation to use correct package name
- Fixed build status badge URL format for GitHub Actions
- Updated all source file comments and JSDoc to reference correct package name

## [1.0.1] - 2025-12-30

### Changed
- Updated package name to match npm organization scope

## [1.0.0] - 2025-12-30

### Added
- Initial release of @zkim-platform/file-format
- **Core Features:**
  - Three-layer encryption with XChaCha20-Poly1305 (platform, user, content layers)
  - Privacy-preserving searchable encryption using OPRF-based trapdoors
  - Integrity validation with BLAKE3 hashing and Ed25519 signatures
  - Error detection and recovery mechanisms for corrupted files
  - Optional GZIP/Brotli compression for efficient storage
  - Performance monitoring and optimization
  - Constant-time security operations to prevent timing attacks
- **Storage Backends:**
  - InMemoryStorage for testing and temporary storage
  - LocalStorageBackend for browser environments
  - Custom storage backend interface (IStorageBackend)
- **Services:**
  - ZKIMFileService - Main file service for creating and managing encrypted files
  - ZkimEncryption - Three-layer encryption service
  - ZkimIntegrity - Integrity validation and tampering detection
  - SearchableEncryption - Privacy-preserving search with trapdoor rotation
  - ZkimErrorRecovery - Advanced error recovery strategies
  - ZkimPerformanceMonitor - Performance tracking and optimization
  - QueryBatcher - Query batching and load balancing
  - TrapdoorRotator - Trapdoor rotation and revocation management
- **Documentation:**
  - Comprehensive README with API reference
  - CONTRIBUTING.md with contribution guidelines
  - 7 working examples (basic, encryption, searchable, integrity, error handling, Node.js, browser)
  - Full TypeScript type definitions
- **Testing:**
  - 1,307 tests passing (2 skipped, 0 failing)
  - 92.09% statement coverage, 82.15% branch coverage, 95.83% function coverage, 92.16% line coverage
  - Test fixtures and utilities
  - Comprehensive unit test coverage
- **CI/CD:**
  - GitHub Actions workflows for automated testing
  - Automated npm publishing on release tags
  - Security scanning and code quality checks
  - Coverage reporting to Codecov

### Security
- Zero-knowledge encryption architecture
- Web Crypto API prohibition (uses libsodium-wrappers-sumo exclusively)
- Secure key derivation and management
- Trapdoor rotation for searchable encryption
- Corruption detection and recovery
- Constant-time comparisons for cryptographic operations
- BLAKE3 hashing (standard ZKIM hash algorithm)
- Ed25519 signatures for integrity validation

### Technical Details
- **Dependencies:**
  - libsodium-wrappers-sumo ^0.7.15 - Cryptographic operations
  - @noble/hashes ^2.0.1 - BLAKE3 hashing
  - @noble/curves ^2.0.1 - Ristretto255 for searchable encryption
- **Platform Support:**
  - Node.js 18+ with ES Modules
  - Modern browsers with TypedArray support
  - Cross-platform compatibility
- **Build:**
  - TypeScript 5.9+ with strict mode
  - ESM and CommonJS dual package support
  - Source maps and declaration files included

