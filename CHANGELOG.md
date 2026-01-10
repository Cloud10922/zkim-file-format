# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-01-09

### Changed
- Updated `libsodium-wrappers-sumo` from `^0.7.15` to `^0.8.0` (major version update)
  - Based on libsodium 1.0.21
  - Note: `crypto_pwhash_*()` functions removed from Sumo builds (not used in this package)
- Updated `@typescript-eslint/parser` from `^8.50.1` to `^8.52.0`
- Updated `@typescript-eslint/eslint-plugin` from `^8.50.1` to `^8.52.0`

### Technical Details
- All dependency updates tested and verified
- CI/CD checks passing with updated dependencies
- No breaking changes affecting package functionality

---

## [1.1.2] - 2026-01-09

### Added
- **Initial Release - v1.0.0:**
  - Secure file format using NIST-standardized post-quantum cryptography
  - Magic bytes: `"ZKIM"` (4 bytes)
  - Version: `1` (2 bytes)
  - Signature type: `1` (ML-DSA-65, 3,309 bytes, FIPS 204)
- **Post-Quantum Cryptography:**
  - ML-DSA-65 (FIPS 204) for digital signatures (3,309 bytes)
  - ML-KEM-768 (FIPS 203) for key encapsulation mechanism and key derivation
  - NIST-standardized algorithms for long-term security
- **ML-KEM-768 Key Derivation**: Platform and user layer keys are derived from ML-KEM-768 shared secrets using BLAKE3. Content layer keys are cryptographically random for per-file perfect forward secrecy.
- **Self-Encryption Helpers**: `zkimSelfEncrypt()` and `zkimSelfDecrypt()` helper functions for ML-KEM-768 self-encryption pattern
- **KEM Ciphertext in Wire Format**: Wire format includes ML-KEM-768 ciphertext (1,088 bytes) for key exchange
- **Key Storage Infrastructure**: ML-KEM-768 secret keys are stored encrypted with user keys
- **Enhanced Security:**
  - Post-quantum resistant signatures and key exchange
  - Future-proof cryptography for store-now-decrypt-later scenarios
  - Explicit threat model documentation
- **Core Features:**
  - Three-layer encryption with XChaCha20-Poly1305 (platform, user, content layers)
  - Privacy-preserving searchable encryption using OPRF-based trapdoors
  - Integrity validation with BLAKE3 hashing and ML-DSA-65 signatures
  - Error detection and recovery mechanisms for corrupted files
  - Optional GZIP/Brotli compression for efficient storage
  - Performance monitoring and optimization
  - Constant-time security operations to prevent timing attacks
- **Documentation:**
  - README with essential information
  - Comprehensive GitHub Wiki with 9 detailed pages:
    - Getting Started guide
    - Storage Integration guide (critical for custom backends)
    - Complete API Reference
    - Code Examples and patterns
    - Security documentation (post-quantum details)
    - Architecture specification
    - Troubleshooting guide
    - Contributing guidelines
- **Build Attestation:**
  - npm Provenance support (SLSA Level 2)
  - Verifiable build information on npm package page
  - Public ledger transparency log entries

### Changed
- Updated package name to `@zkim-platform/file-format` to match npm organization scope
- Updated all code examples and documentation to use correct package name

### Fixed
- Fixed install command in documentation (`npm install @zkim-platform/file-format`)
- Fixed build status badge URL format for GitHub Actions
- Updated all source file comments and JSDoc to reference correct package name
- Fixed platform key usage - now included in encryption key derivation for tenant isolation

### Security
- **Post-Quantum Security:**
  - ML-DSA-65 signatures (FIPS 204) for long-term authenticity
  - ML-KEM-768 key exchange (FIPS 203) for post-quantum key encapsulation
  - ML-KEM-768 key derivation for platform and user layer keys (post-quantum secure)
  - Content layer keys are cryptographically random (per-file perfect forward secrecy)
  - BLAKE3 hashing (256-bit output) for integrity verification and key derivation
  - XChaCha20-Poly1305 symmetric encryption (AEAD) with ML-KEM-768 derived keys
- **Post-Quantum Key Derivation**: Platform and user layer encryption keys are derived from ML-KEM-768 shared secrets, ensuring post-quantum security for key derivation. Content layer keys are random for perfect forward secrecy.
- **Self-Encryption Pattern**: ML-KEM-768 self-encryption pattern for data encrypted by and for the same user/device
- **Key Derivation Pattern**: 
  - Platform key: `blake3([sharedSecret, ...platformKey], { dkLen: 32 })`
  - User key: `blake3([sharedSecret, ...userKey], { dkLen: 32 })`
  - Content key: Cryptographically random (per-file perfect forward secrecy)
- **Note:** This package uses NIST-standardized algorithms (FIPS 203/204) but is not FIPS 140-3 validated by an accredited laboratory.

### Technical Details
- **Dependencies:**
  - libsodium-wrappers-sumo ^0.7.15 - Cryptographic operations (XChaCha20-Poly1305)
  - @noble/hashes ^2.0.1 - BLAKE3 hashing and key derivation
  - @noble/post-quantum ^0.2.1 - ML-DSA-65 and ML-KEM-768
  - @noble/curves ^2.0.1 - Ristretto255 for searchable encryption
- **Algorithm Suite**: `ALG_SUITE_ID = 0x01` represents post-quantum secure suite (ML-KEM-768 for key exchange, ML-DSA-65 for signatures, XChaCha20-Poly1305 for symmetric encryption with post-quantum key derivation, BLAKE3 for hashing)
- **Default Encryption Type**: `"ML-KEM-768+XChaCha20-Poly1305"` (post-quantum key derivation)
- **KEM Ciphertext Size**: 1,088 bytes (ML-KEM-768 standard)
- **Wire Format**: Includes KEM ciphertext for ML-KEM-768 key exchange
- **Backward Compatibility**: Maintained for legacy data formats without ML-KEM-768 components
- **Platform Support:**
  - Node.js 20+ with ES Modules
  - Modern browsers with TypedArray and WebAssembly support
  - Browser builds rely on WebAssembly-backed libsodium (via `libsodium-wrappers-sumo`)
- **Build:**
  - TypeScript 5.9+ with strict mode
  - ESM and CommonJS dual package support
  - Source maps and declaration files included
  - npm Provenance attestation enabled

## [1.1.2] - 2026-01-09

### Changed
- Improved README presentation with centered logo and professional layout
- Replaced verbose technical description with concise value proposition

### Added
- Added ZKIM logo (`zkim-logo.png`) to package for npm package page branding
- Centered logo, title, and badges in README for better visual presentation

---

## [1.1.1] - 2026-01-09

### Fixed
- Fixed internal wiki documentation links to include `.md` extension
- All wiki links now work correctly when browsing repository on GitHub

---

## [1.1.0] - 2026-01-09

### Added
- **Initial Public Release:**
  - Published to npm as `@zkim-platform/file-format`
  - npm Provenance attestation enabled (SLSA Level 2)
  - Public repository for build transparency

### Changed
- Repository made public to enable npm Provenance with OIDC
- Updated npm authentication to use granular access token

---

