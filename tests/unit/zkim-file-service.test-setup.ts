/**
 * Shared test setup for ZKIMFileService tests
 * Provides common test utilities and fixtures
 */

import { beforeAll } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { ZKIMFileService } from "../../src/core/zkim-file-service";
import { defaultLogger } from "../../src/utils/logger";
import { InMemoryStorage } from "../../src/types/storage";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";
import { TEST_USER_ID } from "../fixtures/test-data";

// Initialize sodium once for all tests
beforeAll(async () => {
  await sodium.ready;
});

/**
 * Create test file service instance with default setup
 */
export function createTestFileService(
  config?: ConstructorParameters<typeof ZKIMFileService>[0],
  storage?: InMemoryStorage
): ZKIMFileService {
  const storageBackend = storage ?? new InMemoryStorage();
  return new ZKIMFileService(
    config ?? {
      enableCompression: false,
      enableSearchableEncryption: false,
      enableIntegrityValidation: true,
    },
    defaultLogger,
    storageBackend
  );
}

/**
 * Get test keys as Uint8Array
 */
export function getTestKeys() {
  return {
    platformKey: new Uint8Array(TEST_PLATFORM_KEY),
    userKey: new Uint8Array(TEST_USER_KEY),
    userId: TEST_USER_ID,
  };
}

export { defaultLogger, sodium, InMemoryStorage };

