/**
 * SearchableEncryption Test Setup
 * Shared setup, fixtures, and helpers for searchable encryption tests
 */

import { beforeEach, afterEach, beforeAll } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { SearchableEncryption } from "../../src/core/searchable-encryption";
import { ServiceBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import type {
  SearchQuery,
  ZkimFile,
  SearchableEncryptionConfig,
} from "../../src/types/zkim-file-format";
import { TEST_USER_ID, TEST_FILE_ID } from "../fixtures/test-data";

/**
 * Create a test SearchableEncryption service instance
 */
export function createTestSearchService(
  config?: Partial<SearchableEncryptionConfig>
): SearchableEncryption {
  return new SearchableEncryption(config, defaultLogger);
}

/**
 * Create a test ZkimFile for indexing
 */
export function createTestFile(overrides?: Partial<ZkimFile>): ZkimFile {
  return {
    header: {
      magic: "ZKIM",
      version: 1,
      flags: 0,
      platformKeyId: "platform-key-1",
      userId: TEST_USER_ID,
      fileId: TEST_FILE_ID,
      createdAt: Date.now(),
      chunkCount: 1,
      totalSize: 100,
      compressionType: 1,
      encryptionType: 1,
      hashType: 1,
      signatureType: 1,
      ...overrides?.header,
    },
    chunks: [],
    metadata: {
      fileName: "test.txt",
      userId: TEST_USER_ID,
      mimeType: "text/plain",
      createdAt: Date.now(),
      customFields: {},
      ...overrides?.metadata,
    },
    platformSignature: new Uint8Array(64),
    userSignature: new Uint8Array(64),
    contentSignature: new Uint8Array(64),
    ...overrides,
  };
}

/**
 * Create a test SearchQuery
 */
export function createTestQuery(overrides?: Partial<SearchQuery>): SearchQuery {
  return {
    queryId: `test-query-${Date.now()}`,
    query: "test",
    userId: TEST_USER_ID,
    timestamp: Date.now(),
    priority: "medium",
    ...overrides,
  };
}

/**
 * Setup function for tests that need sodium ready
 */
export async function setupSodium(): Promise<void> {
  await sodium.ready;
}

/**
 * Setup function for tests that need a clean service instance
 */
export function setupServiceCleanup(): {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
} {
  return {
    beforeEach: async () => {
      ServiceBase.clearInstances();
    },
    afterEach: async () => {
      ServiceBase.clearInstances();
    },
  };
}

