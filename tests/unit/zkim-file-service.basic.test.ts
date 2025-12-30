/**
 * ZKIMFileService Basic Tests
 * Tests for constructor and initialization
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ZKIMFileService } from "../../src/core/zkim-file-service";
import { defaultLogger } from "../../src/utils/logger";
import { InMemoryStorage } from "../../src/types/storage";
import { createTestFileService, getTestKeys } from "./zkim-file-service.test-setup";

describe("ZKIMFileService - Basic", () => {
  let fileService: ZKIMFileService;
  let storage: InMemoryStorage;

  beforeAll(async () => {
    const sodium = await import("libsodium-wrappers-sumo");
    await sodium.default.ready;
  });

  beforeEach(async () => {
    storage = new InMemoryStorage();
    fileService = createTestFileService(undefined, storage);
    await fileService.initialize();
  });

  afterEach(async () => {
    await fileService.cleanup();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const service = new ZKIMFileService(undefined, defaultLogger);
      expect(service).toBeInstanceOf(ZKIMFileService);
    });

    it("should create instance with custom config", () => {
      const service = new ZKIMFileService(
        {
          enableCompression: true,
          chunkSize: 1024,
        },
        defaultLogger
      );
      expect(service).toBeInstanceOf(ZKIMFileService);
    });

    it("should create instance with storage backend", () => {
      const storageBackend = new InMemoryStorage();
      const service = new ZKIMFileService(undefined, defaultLogger, storageBackend);
      expect(service).toBeInstanceOf(ZKIMFileService);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const service = new ZKIMFileService(undefined, defaultLogger);
      await expect(service.initialize()).resolves.not.toThrow();
      await service.cleanup();
    });

    it("should not reinitialize if already initialized", async () => {
      await fileService.initialize();
      await expect(fileService.initialize()).resolves.not.toThrow();
    });
  });
});

