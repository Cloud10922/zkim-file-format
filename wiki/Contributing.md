# Contributing

Contributing guidelines for `@zkim-platform/file-format`.

---

## Development Setup

### Prerequisites

- **Node.js:** 20+
- **npm:** 9+
- **TypeScript:** 5.0+
- **Git:** Latest version

### Installation

```bash
# Clone repository
git clone https://github.com/zkdotim/zkim-file-format.git
cd zkim-file-format

# Install dependencies
npm install

# Build package
npm run build

# Run tests
npm test
```

### Development Scripts

```bash
# Build package
npm run build

# Watch mode
npm run build:watch

# Run tests
npm test

# Watch tests
npm run test:watch

# Test coverage
npm run test:coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type check
npm run typecheck
```

---

## Code Style

### TypeScript

- Use TypeScript 5.0+ features
- Strict type checking enabled
- No `any` types (use `unknown` with type guards)
- Explicit return types for public methods

### Import Order

1. External libraries (React, libsodium, @noble/hashes, etc.)
2. Internal shared (`@/shared/*`)
3. Infrastructure (`@/infrastructure/*`)
4. Domain types (`@/domains/*/types`)
5. Domain services (`@/domains/*/services`)
6. Domain components (`@/domains/*/components`)
7. Relative imports (same directory only)

### Naming Conventions

- **Classes:** PascalCase (`ZKIMFileService`)
- **Interfaces:** PascalCase (`IStorageBackend`)
- **Types:** PascalCase (`ZkimFile`)
- **Functions:** camelCase (`createZkimFile`)
- **Variables:** camelCase (`fileId`)
- **Constants:** UPPER_SNAKE_CASE (`DEFAULT_CHUNK_SIZE`)

### Comments

- Add comments for complex logic
- Explain "why" not "what"
- Document service flows with `/** Service Flow: */`
- Document cryptographic choices

---

## Testing

### Test Structure

- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- Test files: `*.test.ts`

### Writing Tests

```typescript
describe("ZKIMFileService", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it("should create file successfully", async () => {
    // Test implementation
  });
});
```

### Mocking

- Use `jest.mock()` for module mocking
- Use `jest.spyOn()` for function mocking
- Clear mocks in `beforeEach` or `afterEach`

### Test Coverage

- Aim for 90%+ coverage
- Cover error paths
- Test edge cases
- Test boundary conditions

---

## Pull Request Process

### Before Submitting

1. **Update Tests:** Add tests for new features
2. **Update Documentation:** Update README and wiki
3. **Run Linting:** `npm run lint`
4. **Run Tests:** `npm test`
5. **Type Check:** `npm run typecheck`
6. **Build:** `npm run build`

### PR Checklist

- [ ] Tests added/updated
- [ ] All tests passing
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Documentation updated
- [ ] Code follows style guide
- [ ] No `any` types
- [ ] No `console.log` (use logger)
- [ ] Error handling implemented

### PR Description

Include:
- Description of changes
- Related issues
- Breaking changes (if any)
- Testing instructions

---

## Code Review

### Review Criteria

- Code quality and style
- Test coverage
- Documentation
- Performance considerations
- Security implications
- Backward compatibility

### Review Process

1. Automated checks (CI/CD)
2. Code review by maintainers
3. Address feedback
4. Approval and merge

---

## Security

### Security Guidelines

- Never commit secrets or keys
- Use secure random number generation
- Validate all inputs
- Handle errors securely
- Follow cryptographic best practices

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Email: security@zkim.im

Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

---

## Documentation

### Code Documentation

- JSDoc comments for public APIs
- Inline comments for complex logic
- Type definitions for all interfaces

### Wiki Documentation

- Update relevant wiki pages
- Add examples for new features
- Update API reference

### README

- Keep README minimal
- Link to wiki for details
- Update version numbers

---

## Architecture Guidelines

### Service Pattern

All services extend `ServiceBase`:

```typescript
export class MyService extends ServiceBase {
  public async initialize(): Promise<void> {
    // Initialization
  }

  public async cleanup(): Promise<void> {
    // Cleanup
  }
}
```

### Error Handling

Use `ErrorUtils` for error handling:

```typescript
const context = ErrorUtils.createContext("MyService", "operation", {
  severity: "medium",
});

const result = await ErrorUtils.withErrorHandling(async () => {
  // Operation
}, context);
```

### Logging

Use logger instead of `console.log`:

```typescript
this.logger.info("Message", { metadata });
this.logger.error("Error", { error });
```

---

## Dependencies

### Adding Dependencies

- Check if dependency is necessary
- Prefer minimal dependencies
- Check license compatibility
- Update `package.json`
- Run `npm install`

### Updating Dependencies

- Test thoroughly after updates
- Check for breaking changes
- Update code if needed
- Update documentation

---

## Versioning

### Semantic Versioning

- **Major (x.0.0):** Breaking changes
- **Minor (x.y.0):** New features, backward compatible
- **Patch (x.y.z):** Bug fixes, backward compatible

### Changelog

Update `CHANGELOG.md` with:
- Version number
- Release date
- Changes (Added, Changed, Fixed, Removed)

---

## License

This project is licensed under MIT License.

By contributing, you agree that your contributions will be licensed under the same license.

---

## Code of Conduct

### Be Respectful

- Be respectful to all contributors
- Accept constructive criticism
- Focus on what is best for the project

### Be Professional

- Use professional language
- Avoid personal attacks
- Keep discussions technical

---

## Getting Help

### Resources

- **[GitHub Issues](https://github.com/zkdotim/zkim-file-format/issues)** - Bug reports and feature requests
- **[GitHub Discussions](https://github.com/zkdotim/zkim-file-format/discussions)** - Questions and discussions
- **[Wiki](Home.md)** - Documentation

### Questions

- Check existing issues and discussions
- Search documentation
- Ask in discussions
- Open an issue if needed

---

**Last Updated:** 2026-01-09

