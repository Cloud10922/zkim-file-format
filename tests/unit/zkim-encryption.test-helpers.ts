/**
 * Shared test helpers for ZkimEncryption tests
 * Provides common setup and utilities
 */

import { beforeAll, beforeEach, afterEach } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { ZkimEncryption } from "../../src/core/zkim-encryption";
import { defaultLogger } from "../../src/utils/logger";
import {
  TEST_CONTENT_SMALL,
  TEST_CONTENT_MEDIUM,
  TEST_CONTENT_LARGE,
  TEST_FILE_ID,
} from "../fixtures/test-data";
import { TEST_PLATFORM_KEY, TEST_USER_KEY } from "../fixtures/test-keys";

// Initialize sodium once for all tests
beforeAll(async () => {
  await sodium.ready;
});

/**
 * Create test encryption instance with default setup
 */
export function createTestEncryption(
  config?: ConstructorParameters<typeof ZkimEncryption>[0]
): ZkimEncryption {
  return new ZkimEncryption(config, defaultLogger);
}

/**
 * Get test keys as Uint8Array
 */
export function getTestKeys() {
  return {
    platformKey: new Uint8Array(TEST_PLATFORM_KEY),
    userKey: new Uint8Array(TEST_USER_KEY),
    fileId: TEST_FILE_ID,
  };
}

/**
 * Setup test encryption instance (for use in beforeEach)
 */
export async function setupEncryption(
  config?: ConstructorParameters<typeof ZkimEncryption>[0]
): Promise<ZkimEncryption> {
  const encryption = createTestEncryption(config);
  await encryption.initialize();
  return encryption;
}

/**
 * Cleanup test encryption instance (for use in afterEach)
 */
export async function cleanupEncryption(
  encryption: ZkimEncryption | undefined
): Promise<void> {
  if (encryption) {
    await encryption.cleanup();
  }
}

/**
 * Test data constants
 */
export const TEST_DATA = {
  SMALL: TEST_CONTENT_SMALL,
  MEDIUM: TEST_CONTENT_MEDIUM,
  LARGE: TEST_CONTENT_LARGE,
  FILE_ID: TEST_FILE_ID,
};

/**
 * Test keys constants
 */
export const TEST_KEYS = {
  PLATFORM: TEST_PLATFORM_KEY,
  USER: TEST_USER_KEY,
};

export { defaultLogger, sodium };

