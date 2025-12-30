# Archived Test Files

This directory contains archived test files that have been split or refactored.

## searchable-encryption.test.ts.original

**Date Archived:** December 30, 2025  
**Date Removed:** December 30, 2025  
**Reason:** Split into multiple focused test files for better maintainability

**Split Files:**
- `searchable-encryption.test-setup.ts` - Shared setup and fixtures
- `searchable-encryption.basic.test.ts` - Basic functionality tests
- `searchable-encryption.config.test.ts` - Configuration toggle tests
- `searchable-encryption.rate-limiting.test.ts` - Rate limiting tests
- `searchable-encryption.trapdoor-rotation.test.ts` - Trapdoor rotation tests
- `searchable-encryption.search-operations.test.ts` - OPRF, relevance, privacy, padding tests
- `searchable-encryption.errors.test.ts` - Error handling tests

**Original Size:** 1,560 lines (58 tests)  
**Split Result:** 6 focused test files + 1 setup file (56 tests, all passing)

**Status:** All tests successfully migrated and passing. Original file removed after verification. File history preserved in Git.

