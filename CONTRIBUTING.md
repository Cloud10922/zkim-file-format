# Contributing to @zkim-platform/file-format

Thank you for your interest in contributing to `@zkim-platform/file-format`! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Security Guidelines](#security-guidelines)

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork:**
   ```bash
   git clone https://github.com/your-username/zkim-file-format.git
   cd zkim-file-format
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/zkdotim/zkim-file-format.git
   ```

4. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+ 
- npm 9+ or higher
- Git

### Installation

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test
```

### Available Scripts

- `npm run build` - Build the package
- `npm run build:watch` - Build in watch mode
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors automatically
- `npm run typecheck` - Run TypeScript type checking
- `npm run example` - Run the basic usage example

## 📝 Coding Standards

### TypeScript

- **Always use TypeScript** - No JavaScript files in `src/`
- **Strict typing** - No `any` types allowed
- **Explicit return types** - Functions should have explicit return types
- **Use interfaces** - Prefer interfaces over type aliases for object shapes

### Code Style

- **ESLint** - All code must pass ESLint checks
- **No console usage** - Use the `ILogger` interface instead
- **Absolute imports** - Use `@/` root imports (configured in tsconfig.json)
- **ES Modules** - Use ES6 `import/export` syntax

### Security Requirements

**CRITICAL**: This package prohibits Web Crypto API usage. See [Security Documentation](../wiki/Security) for complete details.

**Key Requirements:**
- ✅ Use `libsodium-wrappers-sumo` for all cryptographic operations
- ✅ Use `@noble/hashes` for BLAKE3 hashing
- ✅ Always call `await sodium.ready` before using libsodium functions
- ✅ Use `sodium.randombytes_buf()` for random number generation
- ❌ Never use `crypto.subtle`, `crypto.getRandomValues()`, or `window.crypto`
- ❌ Never use `Math.random()` for generating fake data

### Error Handling

- **Always use `ErrorUtils.withErrorHandling()`** for async operations
- **Use custom error types** from `src/types/errors.ts`
- **Provide meaningful error messages** with context
- **Never expose sensitive information** in error messages

### Singleton Pattern

- **Use `ServiceBase`** for service classes
- **Use `SingletonBase`** for basic singleton needs
- **Never create custom singleton patterns**
- **Always implement `initialize()` and `cleanup()` methods**

## 🧪 Testing Requirements

### Test Coverage

- **Minimum 80% coverage** required for all new code
- **Test all error paths** - Not just happy paths
- **Test edge cases** - Boundary conditions, null/undefined handling
- **Test cryptographic operations** - Verify encryption/decryption round-trips

### Writing Tests

- **Use Jest** - All tests use Jest framework
- **Test files** - Place in `tests/unit/` directory
- **Test naming** - Use descriptive test names: `describe("Feature", () => { it("should do X when Y", ...) })`
- **Mock external dependencies** - Mock libsodium and storage backends
- **Clean up** - Always call `cleanup()` on service instances in `afterEach`

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📦 Commit Guidelines

### Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(encryption): add support for key rotation

fix(integrity): correct chunk validation logic

docs(readme): update installation instructions

test(encryption): add tests for edge cases
```

## 🔀 Pull Request Process

1. **Update your branch** with latest changes from upstream:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure all checks pass:**
   ```bash
   npm run build
   npm test
   npm run lint
   npm run typecheck
   ```

3. **Create a pull request** with:
   - Clear description of changes
   - Reference to related issues
   - Test coverage information
   - Breaking changes (if any)

4. **PR Checklist:**
   - [ ] Code follows coding standards
   - [ ] Tests added/updated and passing
   - [ ] Test coverage meets 80% threshold
   - [ ] Documentation updated (if needed)
   - [ ] No ESLint errors
   - [ ] No TypeScript errors
   - [ ] No Web Crypto API usage (see Security Requirements above)
   - [ ] All service instances cleaned up in tests

## 🔒 Security Guidelines

### Cryptographic Operations

- **Use libsodium-wrappers-sumo exclusively** - See Security Requirements above
- **Always validate inputs** - Check for null/undefined before crypto operations
- **Use constant-time comparisons** - For security-sensitive operations
- **Clear sensitive data** - Zero out keys and sensitive data when done

### Key Management

- **Never log keys** - Keys should never appear in logs or error messages
- **Use secure storage** - For production, use secure storage backends
- **Rotate keys regularly** - Implement key rotation policies

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities. Instead, please email security@zk.im with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

## 📚 Documentation

### Code Comments

- **Explain "why" not "what"** - Comments should explain reasoning
- **Document complex algorithms** - Especially cryptographic operations
- **Use JSDoc** - For public APIs and complex functions

### README Updates

- **Update README.md** - When adding new features or changing APIs
- **Add examples** - Include code examples for new features
- **Update configuration** - Document new configuration options

## 🎯 Project Structure

```
packages/zkim-file-format/
├── src/                    # Source code
│   ├── core/              # Core services
│   ├── types/             # TypeScript types
│   ├── utils/             # Utility functions
│   └── constants/         # Constants
├── tests/                 # Test files
│   ├── unit/              # Unit tests
│   └── fixtures/         # Test fixtures
├── examples/              # Example files
├── dist/                  # Build output (generated)
└── docs/                 # Documentation (if needed)
```

## 📜 Code of Conduct

This project adheres to a [Code of Conduct](./CODE_OF_CONDUCT.md) to ensure a welcoming and inclusive environment for all contributors. By participating, you agree to uphold this code.

## ❓ Questions?

- Open an issue for bug reports or feature requests
- Check existing issues before creating new ones
- Be respectful and constructive in discussions

Thank you for contributing to `@zkim-platform/file-format`! 🎉

