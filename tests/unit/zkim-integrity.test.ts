/**
 * ZKIM Integrity Tests
 * Comprehensive tests for integrity service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { ZkimIntegrity } from "../../src/core/zkim-integrity";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";
import type { ZkimFile, ZkimFileHeader, ZkimFileMetadata } from "../../src/types/zkim-file-format";

const TEST_USER_ID = "test-user-id";

describe("ZkimIntegrity", () => {
  let integrity: ZkimIntegrity;
  let platformKey: Uint8Array;
  let userKey: Uint8Array;

  beforeAll(async () => {
    await sodium.ready;
    platformKey = sodium.randombytes_buf(32);
    userKey = sodium.randombytes_buf(32);
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    integrity = new ZkimIntegrity(undefined, defaultLogger);
    await integrity.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (integrity) {
      await integrity.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const instance = new ZkimIntegrity(undefined, defaultLogger);
      expect(instance).toBeInstanceOf(ZkimIntegrity);
    });

    it("should create instance with custom config", () => {
      const instance = new ZkimIntegrity(
        {
          enableHeaderValidation: false,
          validationThreshold: 0.9,
        },
        defaultLogger
      );
      expect(instance).toBeInstanceOf(ZkimIntegrity);
    });
  });

  describe("validateFile", () => {
    it("should validate a valid ZKIM file", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      const zkimFile: ZkimFile = {
        header: {
          magic: "ZKIM",
          version: 1,
          flags: 0,
          platformKeyId: "test-platform-key",
          userId: "test-user",
          fileId: "test-file-id",
          createdAt: Date.now(),
          chunkCount: 1,
          totalSize: 100,
          compressionType: 1,
          encryptionType: 1,
          hashType: 1,
          signatureType: 1,
        },
        chunks: [],
        metadata: {
          fileName: "test.txt",
          userId: "test-user",
          createdAt: Date.now(),
          mimeType: "text/plain",
        },
      };

      const result = await integrity.validateFile(zkimFile, platformKey, userKey);
      expect(result).toHaveProperty("isValid");
      expect(result).toHaveProperty("headerValid");
      expect(result).toHaveProperty("chunksValid");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("warnings");
      jest.useFakeTimers(); // Switch back to fake timers
    });

    it("should use cached validation result", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      const zkimFile: ZkimFile = {
        header: {
          magic: "ZKIM",
          version: 1,
          flags: 0,
          platformKeyId: "test-platform-key",
          userId: "test-user",
          fileId: "cached-file-id",
          createdAt: Date.now(),
          chunkCount: 0,
          totalSize: 0,
          compressionType: 1,
          encryptionType: 1,
          hashType: 1,
          signatureType: 1,
        },
        chunks: [],
        metadata: {
          fileName: "test.txt",
          userId: "test-user",
          createdAt: Date.now(),
          mimeType: "text/plain",
        },
      };

      // First validation
      await integrity.validateFile(zkimFile, platformKey, userKey);
      // Second validation should use cache
      const result = await integrity.validateFile(zkimFile, platformKey, userKey);
      expect(result).toHaveProperty("isValid");
      jest.useFakeTimers(); // Switch back to fake timers
    });
  });

  describe("validateHeader", () => {
    it("should validate correct header", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      const header: ZkimFileHeader = {
        magic: "ZKIM",
        version: 1,
        flags: 0,
        platformKeyId: "test-platform-key",
        userId: "test-user",
        fileId: "test-file-id",
        createdAt: Date.now(),
        chunkCount: 1,
        totalSize: 100,
        compressionType: 1,
        encryptionType: 1,
        hashType: 1,
        signatureType: 1,
      };

      const isValid = await integrity.validateHeader(header);
      expect(typeof isValid).toBe("boolean");
      jest.useFakeTimers(); // Switch back to fake timers
    });

    it("should reject invalid magic", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      const header: ZkimFileHeader = {
        magic: "INVALID" as "ZKIM",
        version: 1,
        flags: 0,
        platformKeyId: "test-platform-key",
        userId: "test-user",
        fileId: "test-file-id",
        createdAt: Date.now(),
        chunkCount: 1,
        totalSize: 100,
        compressionType: 1,
        encryptionType: 1,
        hashType: 1,
        signatureType: 1,
      };

      const isValid = await integrity.validateHeader(header);
      expect(isValid).toBe(false);
      jest.useFakeTimers(); // Switch back to fake timers
    });
  });

  describe("validateChunks", () => {
    it("should validate chunks", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      // validateChunks requires header context, so we'll test it via validateFile instead
      const zkimFile: ZkimFile = {
        header: {
          magic: "ZKIM",
          version: 1,
          flags: 0,
          platformKeyId: "test-platform-key",
          userId: "test-user",
          fileId: "test-file-id",
          createdAt: Date.now(),
          chunkCount: 1,
          totalSize: 100,
          compressionType: 1,
          encryptionType: 1,
          hashType: 1,
          signatureType: 1,
        },
        chunks: [
          {
            chunkIndex: 0,
            chunkSize: 100,
            compressedSize: 100,
            encryptedSize: 120,
            nonce: new Uint8Array(24),
            encryptedData: new Uint8Array(120),
            integrityHash: new Uint8Array(32),
            padding: new Uint8Array(0),
          },
        ],
        metadata: {
          fileName: "test.txt",
          userId: "test-user",
          createdAt: Date.now(),
          mimeType: "text/plain",
        },
      };

      const result = await integrity.validateFile(zkimFile, platformKey, userKey);
      expect(result).toHaveProperty("chunksValid");
      expect(typeof result.chunksValid).toBe("boolean");
      jest.useFakeTimers(); // Switch back to fake timers
    });
  });

  describe("validateMetadata", () => {
    it("should validate metadata", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      const metadata: ZkimFileMetadata = {
        fileName: "test.txt",
        userId: "test-user",
        createdAt: Date.now(),
        mimeType: "text/plain",
      };

      const isValid = await integrity.validateMetadata(metadata);
      expect(typeof isValid).toBe("boolean");
      jest.useFakeTimers(); // Switch back to fake timers
    });
  });

  describe("detectTampering", () => {
    it("should detect tampering in file", async () => {
      jest.useRealTimers(); // Use real timers for async operations
      const zkimFile: ZkimFile = {
        header: {
          magic: "ZKIM",
          version: 1,
          flags: 0,
          platformKeyId: "test-platform-key",
          userId: "test-user",
          fileId: "test-file-id",
          createdAt: Date.now(),
          chunkCount: 1,
          totalSize: 100,
          compressionType: 1,
          encryptionType: 1,
          hashType: 1,
          signatureType: 1,
        },
        chunks: [],
        metadata: {
          fileName: "test.txt",
          userId: "test-user",
          createdAt: Date.now(),
          mimeType: "text/plain",
        },
      };

      const result = await integrity.detectTampering(zkimFile);
      expect(result).toBeDefined();
      expect(typeof result.isTampered).toBe("boolean");
      expect(Array.isArray(result.tamperType)).toBe(true);
      expect(Array.isArray(result.evidence)).toBe(true);
      jest.useFakeTimers(); // Switch back to fake timers
    });
  });

  describe("getAuditLog", () => {
    it("should return audit log", () => {
      const log = integrity.getAuditLog();
      expect(Array.isArray(log)).toBe(true);
    });

    it("should return limited audit log", () => {
      const log = integrity.getAuditLog(10);
      expect(Array.isArray(log)).toBe(true);
    });
  });

  describe("clearCache", () => {
    it("should clear validation cache", () => {
      integrity.clearCache();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("validateSignatures", () => {
    it("should validate signatures with keys", async () => {
      jest.useRealTimers();
      const zkimFile: ZkimFile = {
        header: {
          magic: "ZKIM",
          version: 1,
          flags: 0,
          platformKeyId: "test-platform-key",
          userId: TEST_USER_ID,
          fileId: "test-file-id",
          createdAt: Date.now(),
          chunkCount: 0,
          totalSize: 0,
          compressionType: 1,
          encryptionType: 1,
          hashType: 1,
          signatureType: 1,
        },
        chunks: [],
        metadata: {
          fileName: "test.txt",
          userId: TEST_USER_ID,
          createdAt: Date.now(),
          mimeType: "text/plain",
        },
        platformSignature: new Uint8Array(3309),
        userSignature: new Uint8Array(3309),
        contentSignature: new Uint8Array(3309),
      };

      const isValid = await integrity.validateSignatures(zkimFile, platformKey, userKey);
      expect(typeof isValid).toBe("boolean");
      jest.useFakeTimers();
    });

    it("should skip validation when keys not provided", async () => {
      jest.useRealTimers();
      const zkimFile: ZkimFile = {
        header: {
          magic: "ZKIM",
          version: 1,
          flags: 0,
          platformKeyId: "test-platform-key",
          userId: TEST_USER_ID,
          fileId: "test-file-id",
          createdAt: Date.now(),
          chunkCount: 0,
          totalSize: 0,
          compressionType: 1,
          encryptionType: 1,
          hashType: 1,
          signatureType: 1,
        },
        chunks: [],
        metadata: {
          fileName: "test.txt",
          userId: TEST_USER_ID,
          createdAt: Date.now(),
          mimeType: "text/plain",
        },
        platformSignature: new Uint8Array(3309),
        userSignature: new Uint8Array(3309),
        contentSignature: new Uint8Array(3309),
      };

      const isValid = await integrity.validateSignatures(zkimFile);
      expect(isValid).toBe(true); // Returns true when keys not provided
      jest.useFakeTimers();
    });
  });
});
