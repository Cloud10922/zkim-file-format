# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

- **Email:** security@zk.im
- **GitHub Security Advisory:** Use the "Report a vulnerability" button on the repository's Security tab

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity
- Suggested fix (if available)
- Your contact information (for follow-up questions)

### Response Timeline

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Resolution:** Depends on severity and complexity

### Security Best Practices

When using `@zkim-platform/file-format`:

1. **Always use the latest version** - Security patches are included in updates
2. **Never commit keys or secrets** - Use secure key management
3. **Validate all inputs** - Don't trust user-provided data
4. **Use secure random generation** - Always use `libsodium-wrappers-sumo` for cryptographic operations
5. **Keep dependencies updated** - Run `npm audit` regularly
6. **Follow security guidelines** - See [Security Considerations](../README.md#security-considerations) in README

### Known Security Considerations

- **Web Crypto API Prohibition:** This package prohibits Web Crypto API usage. See README for details.
- **Key Management:** Never store keys in plaintext. Use secure storage mechanisms.
- **Constant-Time Operations:** All security-sensitive operations use constant-time implementations.

### Security Updates

Security updates will be:

- Released as patch versions (e.g., 1.0.0 → 1.0.1)
- Documented in CHANGELOG.md
- Announced via GitHub releases
- Tagged with `security` label

### Acknowledgments

We appreciate responsible disclosure. Security researchers who report vulnerabilities will be:

- Acknowledged in the security advisory (if desired)
- Credited in the CHANGELOG (if desired)
- Added to our security hall of fame (if desired)

Thank you for helping keep `@zkim-platform/file-format` secure!

