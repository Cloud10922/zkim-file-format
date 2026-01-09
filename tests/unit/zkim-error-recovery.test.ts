/**
 * ZKIM Error Recovery Tests
 * Comprehensive tests for error recovery service
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import { ZkimErrorRecovery } from "../../src/core/zkim-error-recovery";
import { SingletonBase } from "../../src/utils/singleton-base";
import { defaultLogger } from "../../src/utils/logger";

describe("ZkimErrorRecovery", () => {
  let recovery: ZkimErrorRecovery;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
    recovery = new ZkimErrorRecovery(defaultLogger);
    await recovery.initialize();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    if (recovery) {
      await recovery.cleanup();
    }
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should create instance with default logger", () => {
      const instance = new ZkimErrorRecovery();
      expect(instance).toBeInstanceOf(ZkimErrorRecovery);
    });

    it("should create instance with custom logger", () => {
      const instance = new ZkimErrorRecovery(defaultLogger);
      expect(instance).toBeInstanceOf(ZkimErrorRecovery);
    });
  });

  describe("recoverFromCorruption", () => {
    it("should attempt recovery from corruption", async () => {
      jest.useRealTimers();
      const corruptedData = new Uint8Array([0x5a, 0x4b, 0x49, 0x4d, 0x00, 0x01]);
      const result = await recovery.recoverFromCorruption(corruptedData, "test-file-id");
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("errors");
      jest.useFakeTimers();
    });
  });

  describe("validateAndRepair", () => {
    it("should validate and repair data", async () => {
      jest.useRealTimers();
      const data = new Uint8Array([0x5a, 0x4b, 0x49, 0x4d, 0x00, 0x01]);
      const result = await recovery.validateAndRepair(data, "test-file-id");
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("errors");
      jest.useFakeTimers();
    });
  });
});

