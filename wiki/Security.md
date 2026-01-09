# Security

Security documentation for `@zkim-platform/file-format`, including post-quantum cryptography, threat model, and best practices.

---

## ⚠️ FIPS Validation Disclaimer

**CRITICAL:** This implementation uses **NIST-standardized algorithms (FIPS 203/204)**, but the **implementation itself is NOT FIPS 140-3 validated** by an accredited laboratory.

**What this means:**
- ✅ Uses NIST-standardized algorithms (ML-DSA-65, ML-KEM-768)
- ✅ Follows FIPS 203/204 specifications
- ✅ Implements algorithms according to NIST standards
- ❌ **Implementation not validated by accredited lab**
- ❌ **Not certified for government use requiring FIPS validation**
- ❌ **Not suitable for regulatory compliance requiring FIPS-validated modules**

**For FIPS-validated implementations:**
- Use FIPS-validated cryptographic modules from accredited vendors
- Obtain FIPS 140-3 validation from accredited laboratory
- Follow government compliance requirements (e.g., Common Criteria)
- Consult with compliance experts for regulatory requirements

**Security Audit Note:** This package is designed for security audits and uses industry-standard implementations, but users requiring FIPS validation must use FIPS-validated modules.

---

## Post-Quantum Cryptography

### Overview

`@zkim-platform/file-format` uses **NIST-standardized post-quantum algorithms** to protect against both classical and quantum computing threats:

- **ML-DSA-65 (FIPS 204)** - Digital signatures (3,309 bytes)
- **ML-KEM-768 (FIPS 203)** - Key encapsulation mechanism
- **BLAKE3** - Hashing algorithm (256-bit output)
- **XChaCha20-Poly1305** - Symmetric encryption (AEAD)

### ML-DSA-65 (FIPS 204)

**Digital Signature Algorithm** - Post-quantum secure digital signatures.

**Key Sizes:**
- Public Key: 1,952 bytes
- Secret Key: 4,032 bytes
- Signature: 3,309 bytes

**Properties:**
- ✅ NIST-standardized (FIPS 204)
- ✅ Post-quantum secure
- ✅ Resistant to quantum attacks
- ✅ Deterministic signatures

**Usage:**
```typescript
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

// Generate key pair
const { publicKey, secretKey } = ml_dsa65.keygen();

// Sign data
const signature = ml_dsa65.sign(message, secretKey);

// Verify signature
const isValid = ml_dsa65.verify(signature, message, publicKey);
```

### ML-KEM-768 (FIPS 203)

**Key Encapsulation Mechanism** - For post-quantum key exchange and key derivation.

**Key Sizes:**
- Public Key: 1,184 bytes
- Secret Key: 2,400 bytes
- Ciphertext: 1,088 bytes
- Shared Secret: 32 bytes

**Properties:**
- ✅ NIST-standardized (FIPS 203)
- ✅ Post-quantum secure
- ✅ Resistant to quantum attacks
- ✅ Used for key derivation in all encryption layers

**Key Derivation Pattern:**

Platform and user layer encryption keys in ZKIM are derived from ML-KEM-768 shared secrets. Content layer keys are cryptographically random for per-file perfect forward secrecy.

1. **Generate ML-KEM-768 key pair** (or use recipient's public key)
2. **Encapsulate shared secret** (32 bytes)
3. **Derive encryption keys** using BLAKE3:
   - Platform key: `blake3([sharedSecret, ...platformKey], { dkLen: 32 })`
   - User key: `blake3([sharedSecret, ...userKey], { dkLen: 32 })`
   - Content key: Cryptographically random (per-file perfect forward secrecy)
4. **Use derived keys** for XChaCha20-Poly1305 encryption

This pattern ensures post-quantum security for platform and user layer encryption operations. Content layer keys provide perfect forward secrecy by being randomly generated per file.

### BLAKE3

**Hashing Algorithm** - Standard ZKIM hash algorithm.

**Properties:**
- ✅ Fast and secure
- ✅ Variable output length
- ✅ 256-bit output (default)
- ✅ Used for integrity hashing

**Usage:**
```typescript
import { blake3 } from "@noble/hashes/blake3.js";

const hash = blake3(data, { dkLen: 32 }); // 256-bit hash
```

### XChaCha20-Poly1305

**Symmetric Encryption** - AEAD (Authenticated Encryption with Associated Data).

**Properties:**
- ✅ 256-bit keys
- ✅ 192-bit nonces (24 bytes)
- ✅ 128-bit authentication tag (16 bytes)
- ✅ Constant-time operations

---

## Three-Layer Encryption

### Architecture

The ZKIM file format uses **three-layer encryption with ML-KEM-768 key derivation** for maximum post-quantum security:

1. **Platform Layer** - Encrypted with ML-KEM-768 derived key (includes platform key in derivation)
2. **User Layer** - Encrypted with ML-KEM-768 derived key (includes user key in derivation)
3. **Content Layer** - Encrypted with cryptographically random content key (per-file perfect forward secrecy)

### ML-KEM-768 Key Derivation

Platform and user layer encryption keys are derived using ML-KEM-768 shared secrets combined with base keys. Content layer keys are cryptographically random:

```typescript
// Generate ML-KEM-768 key pair
const kemKeyPair = ml_kem768.keygen();

// Encapsulate to derive shared secret
const { sharedSecret } = ml_kem768.encapsulate(kemKeyPair.publicKey);

// Derive platform key (includes platformKey parameter for tenant isolation)
const platformKeySeed = new Uint8Array([...sharedSecret, ...platformKey]);
const derivedPlatformKey = blake3(platformKeySeed, { dkLen: 32 });

// Derive user key (includes userKey parameter)
const userKeySeed = new Uint8Array([...sharedSecret, ...userKey]);
const derivedUserKey = blake3(userKeySeed, { dkLen: 32 });

// Content key is cryptographically random (not derived)
const contentKey = sodium.randombytes_buf(32);

// Encrypt with XChaCha20-Poly1305 using derived keys
const platformCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
  platformData,
  null,
  null,
  platformNonce,
  derivedPlatformKey
);

const userCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
  userData,
  null,
  null,
  userNonce,
  derivedUserKey
);

const contentCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
  contentData,
  null,
  null,
  contentNonce,
  contentKey
);
```

### Encryption Flow

```
Original Data
    ↓
Compression (optional)
    ↓
ML-KEM-768 Key Exchange → Shared Secret
    ↓
BLAKE3 Key Derivation (sharedSecret + content metadata)
    ↓
Content Encryption (XChaCha20-Poly1305)
    ↓
ML-KEM-768 Key Exchange → Shared Secret
    ↓
BLAKE3 Key Derivation (sharedSecret + userKey)
    ↓
User Encryption (XChaCha20-Poly1305)
    ↓
ML-KEM-768 Key Exchange → Shared Secret
    ↓
BLAKE3 Key Derivation (sharedSecret + platformKey)
    ↓
Platform Encryption (XChaCha20-Poly1305)
    ↓
ZKIM File Format (includes KEM ciphertext)
```

### Key Management

**Platform Key:**
- Managed by platform/service provider
- Combined with ML-KEM-768 shared secret for key derivation
- Should be stored securely

**User Key:**
- Managed by user/application
- Combined with ML-KEM-768 shared secret for key derivation
- Must be stored securely (never in plaintext)

**Content Key:**
- Cryptographically random (32 bytes, per-file perfect forward secrecy)
- Used for content-layer encryption
- Stored encrypted in user layer

### Security Benefits

- ✅ **Defense in Depth:** Multiple encryption layers
- ✅ **Key Isolation:** Each layer uses different keys
- ✅ **Access Control:** Platform and user can decrypt independently
- ✅ **Forward Secrecy:** Content key can be rotated

---

## Integrity Validation

### BLAKE3 Integrity Hashing

All file chunks are hashed using BLAKE3:

```typescript
const chunkHash = blake3(chunkData, { dkLen: 32 });
```

### Merkle Tree

Chunks are organized in a Merkle tree for efficient integrity validation:

```typescript
const merkleRoot = calculateMerkleRoot(chunks);
```

### Signature Validation

Files are signed with ML-DSA-65 signatures:

- **Platform Signature:** Validates platform-layer integrity
- **User Signature:** Validates user-layer integrity
- **Content Signature:** Validates content-layer integrity

### Tamper Detection

The integrity validation system detects:
- ✅ Modified chunks
- ✅ Corrupted data
- ✅ Invalid signatures
- ✅ Tampered metadata

---

## Threat Model

### Security Assumptions

**Trusted Components:**
- ✅ Cryptographic libraries (`libsodium-wrappers-sumo`, `@noble/post-quantum`) are trusted
- ✅ Random number generation is cryptographically secure
- ✅ Key management is handled securely by the application
- ✅ Storage backend provides basic availability (not necessarily confidentiality)

**Security Guarantees:**
- ✅ **Confidentiality:** Data encrypted with XChaCha20-Poly1305 (256-bit keys)
- ✅ **Integrity:** BLAKE3 hashing and ML-DSA-65 signatures detect tampering
- ✅ **Authenticity:** ML-DSA-65 signatures provide non-repudiation
- ✅ **Post-Quantum Security:** ML-DSA-65 and ML-KEM-768 resist quantum attacks
- ✅ **Forward Secrecy:** Content keys can be rotated independently

**Security Boundaries:**
- ✅ Encryption keys are never stored in plaintext
- ✅ Keys are never transmitted over network
- ✅ Signatures prevent unauthorized modifications
- ✅ Three-layer encryption provides defense in depth

### Protected Against

1. **Quantum Computing Attacks**
   - ML-DSA-65 and ML-KEM-768 are post-quantum secure
   - Resistant to Shor's algorithm (factoring/discrete log)
   - Resistant to Grover's algorithm (search attacks)
   - Suitable for "store-now-decrypt-later" scenarios

2. **Classical Cryptanalysis**
   - XChaCha20-Poly1305 is secure against classical attacks
   - BLAKE3 is secure against collision and preimage attacks
   - 256-bit keys provide 128-bit security level

3. **Tampering**
   - Integrity validation detects any modifications
   - ML-DSA-65 signatures prevent unauthorized changes
   - Merkle tree enables efficient tamper detection
   - Chunk-level validation detects partial corruption

4. **Key Compromise**
   - Three-layer encryption limits impact of key compromise
   - Compromising one layer doesn't expose other layers
   - Content keys can be rotated independently
   - Platform and user keys are isolated

5. **Timing Attacks**
   - Constant-time operations prevent timing attacks
   - Secure comparison functions used throughout
   - No secret-dependent branches in critical paths

6. **Replay Attacks**
   - Timestamps in file headers prevent replay
   - Unique file IDs prevent duplicate detection issues
   - Signatures include file metadata

### Not Protected Against

1. **Key Theft**
   - If keys are stolen, data can be decrypted
   - **Mitigation:** Use secure key management (HSM, secure enclave, hardware security modules)
   - **Mitigation:** Implement key rotation policies
   - **Mitigation:** Use multi-factor authentication for key access

2. **Malicious Storage Provider**
   - Storage provider can delete or modify files
   - **Mitigation:** Use integrity validation to detect modifications
   - **Mitigation:** Use multiple storage backends (redundancy)
   - **Mitigation:** Monitor storage access logs

3. **Side-Channel Attacks**
   - Physical access to device may enable side-channel attacks
   - **Mitigation:** Use secure hardware when possible
   - **Mitigation:** Implement constant-time operations (already done)
   - **Mitigation:** Use secure execution environments

4. **Implementation Bugs**
   - Bugs in cryptographic libraries or this implementation
   - **Mitigation:** Regular security audits
   - **Mitigation:** Use well-tested cryptographic libraries
   - **Mitigation:** Code review and testing

5. **Social Engineering**
   - Attackers may trick users into revealing keys
   - **Mitigation:** User education and training
   - **Mitigation:** Multi-factor authentication
   - **Mitigation:** Secure key storage practices

6. **Compromised Build Environment**
   - Malicious code injection during build process
   - **Mitigation:** Use npm Provenance (SLSA Level 2) for build attestation
   - **Mitigation:** Verify package integrity before installation
   - **Mitigation:** Use trusted build environments

---

## Best Practices

### Key Management

**✅ DO:**
- Store keys in secure storage (HSM, secure enclave)
- Use key derivation for content keys
- Rotate keys regularly
- Use different keys for different users/files

**❌ DON'T:**
- Store keys in plaintext
- Share keys between users
- Use weak keys (always use 32-byte keys)
- Hardcode keys in source code

### Storage Security

**✅ DO:**
- Use encrypted storage backends
- Enable integrity validation
- Monitor for tampering
- Use access control lists

**❌ DON'T:**
- Store files in plaintext
- Skip integrity validation
- Trust storage provider blindly
- Expose storage credentials

### Application Security

**✅ DO:**
- Validate all inputs
- Handle errors securely
- Use secure random number generation
- Implement proper access control

**❌ DON'T:**
- Expose keys in error messages
- Log sensitive data
- Use insecure random number generators
- Skip input validation

---

## Security Considerations

### Algorithm Choices

**Why ML-DSA-65 (FIPS 204)?**
- ✅ NIST-standardized (FIPS 204) - Official NIST standard
- ✅ Post-quantum secure - Resistant to quantum attacks
- ✅ Deterministic signatures - Same message produces same signature
- ✅ Well-studied and secure - Extensive cryptanalysis
- ✅ Long-term security - Suitable for "store-now-decrypt-later"
- ✅ 3,309-byte signatures - Large but necessary for post-quantum security

**Why ML-KEM-768 (FIPS 203)?**
- ✅ NIST-standardized (FIPS 203) - Official NIST standard
- ✅ Post-quantum secure - Resistant to quantum attacks
- ✅ Efficient key exchange - Optimized for performance
- ✅ Well-studied and secure - Extensive cryptanalysis
- ✅ 1,184-byte public keys - Reasonable size for post-quantum

**Why BLAKE3?**
- ✅ Fast and secure - Better performance than SHA-256
- ✅ Variable output length - Flexible for different use cases
- ✅ Standard ZKIM hash algorithm - Consistent across ZKIM ecosystem
- ✅ 256-bit output - Provides 128-bit security level
- ✅ Resistant to collision and preimage attacks

**Why XChaCha20-Poly1305?**
- ✅ Secure AEAD construction - Authenticated encryption
- ✅ Large nonce space (192 bits) - Prevents nonce reuse
- ✅ Constant-time operations - Resistant to timing attacks
- ✅ Well-studied and secure - Extensive analysis
- ✅ 256-bit keys - Provides 128-bit security level

### NIST Specification Compliance

**Algorithm Implementation:**
- ✅ ML-DSA-65 follows FIPS 204 specification
- ✅ ML-KEM-768 follows FIPS 203 specification
- ✅ Uses `@noble/post-quantum` library (NIST-compliant implementation)
- ✅ Key sizes match NIST specifications exactly
- ✅ Signature sizes match NIST specifications exactly

**Verification:**
- All cryptographic constants match NIST specifications
- Key generation follows NIST algorithms
- Signature generation follows NIST algorithms
- Verification follows NIST algorithms

**Note:** While the implementation follows NIST specifications, it is not FIPS 140-3 validated. See FIPS Validation Disclaimer above.

### Key Sizes

All keys use appropriate sizes:
- **Symmetric Keys:** 256 bits (32 bytes)
- **Nonces:** 192 bits (24 bytes)
- **Authentication Tags:** 128 bits (16 bytes)
- **ML-DSA-65 Public Key:** 1,952 bytes
- **ML-DSA-65 Secret Key:** 4,032 bytes
- **ML-DSA-65 Signature:** 3,309 bytes

### Random Number Generation

All random numbers are generated using secure sources:
- `sodium.randombytes_buf()` - libsodium secure random
- Never use `Math.random()` or insecure PRNGs

---

## Security Updates

### Reporting Security Issues

If you discover a security vulnerability, please:
1. **DO NOT** open a public issue
2. Email security@zkim.im with details
3. Include steps to reproduce
4. Wait for response before disclosure

### Security Updates

Security updates are released as:
- **Patch versions** (1.0.x) - Security fixes
- **Minor versions** (1.x.0) - Security improvements
- **Major versions** (x.0.0) - Breaking security changes

---

## Compliance

### Standards Compliance

- ✅ **FIPS 203** - ML-KEM-768 key encapsulation
- ✅ **FIPS 204** - ML-DSA-65 digital signatures
- ✅ **NIST Standards** - Post-quantum cryptography

### Regulatory Compliance

This package may help with:
- **GDPR** - Data encryption and privacy
- **HIPAA** - Healthcare data protection
- **SOC 2** - Security controls
- **ISO 27001** - Information security

**Note:** Compliance depends on implementation and deployment. Consult with compliance experts for specific requirements.

---

## See Also

- **[Architecture](Architecture)** - File format specification
- **[API Reference](API-Reference)** - Complete API documentation
- **[Getting Started](Getting-Started)** - Installation and setup

---

**Last Updated:** 2026-01-09

