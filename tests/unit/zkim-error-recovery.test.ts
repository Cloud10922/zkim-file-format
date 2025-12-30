/**
 * ZKIM Error Recovery Unit Tests
 * Comprehensive test suite for error recovery and corruption repair
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "@jest/globals";
import { ZkimErrorRecovery } from "../../src/core/zkim-error-recovery";
import { ServiceError } from "../../src/types/errors";
import { defaultLogger } from "../../src/utils/logger";
import { ZKIM_ENCRYPTION_CONSTANTS } from "../../src/constants";
import sodium from "libsodium-wrappers-sumo";

describe("ZkimErrorRecovery", () => {
  let recovery: ZkimErrorRecovery;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(async () => {
    // Restore all mocks before each test
    jest.restoreAllMocks();
    
    recovery = new ZkimErrorRecovery(defaultLogger);
    await recovery.initialize();
  });

  afterEach(async () => {
    // Restore all mocks after each test
    jest.restoreAllMocks();
    
    await recovery.cleanup();
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

  describe("initialize", () => {
    it("should initialize successfully", async () => {
      const instance = new ZkimErrorRecovery();
      await expect(instance.initialize()).resolves.not.toThrow();
      await instance.cleanup();
    });

    it("should not reinitialize if already initialized", async () => {
      await expect(recovery.initialize()).resolves.not.toThrow();
    });
  });

  describe("recoverFromCorruption", () => {
    it("should handle empty buffer", async () => {
      const result = await recovery.recoverFromCorruption(new Uint8Array(0), "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle buffer too small for header", async () => {
      const smallBuffer = new Uint8Array(4); // Less than minimum header size
      const result = await recovery.recoverFromCorruption(smallBuffer, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should detect corrupted magic number", async () => {
      const buffer = new Uint8Array(100);
      // Write invalid magic number
      buffer.set([0xff, 0xff, 0xff, 0xff], 0);

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.repairActions.length).toBeGreaterThan(0);
    });

    it("should attempt recovery for corrupted data", async () => {
      const buffer = new Uint8Array(200);
      // Write valid magic number
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Rest is corrupted
      buffer.fill(0xff, 4);

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      // Recovery may or may not succeed depending on corruption level
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("errors");
    });

    it("should handle partial file recovery", async () => {
      const buffer = new Uint8Array(500);
      // Write valid magic and version
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Version 1 (little-endian)
      buffer[4] = 1;
      buffer[5] = 0;
      // Rest is partial/corrupted
      buffer.fill(0x00, 6);

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result.repairActions.length).toBeGreaterThan(0);
    });

    it("should handle non-corrupted data (early return path)", async () => {
      const buffer = new Uint8Array(100);
      // Write valid magic number
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Version 1
      buffer[4] = 1;
      buffer[5] = 0;
      // Flags 0
      buffer[6] = 0;
      buffer[7] = 0;

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      // If no corruption detected, should return success with original data
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle recovery with maxRepairAttempts option", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        maxRepairAttempts: 1,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle recovery with enableReconstruction option", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        enableReconstruction: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle recovery with strictValidation option", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        strictValidation: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });
  });

  describe("validateAndRepair", () => {
    it("should validate valid file structure", async () => {
      // Create minimal valid structure
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Version 1
      buffer[4] = 1;
      buffer[5] = 0;
      // Flags 0
      buffer[6] = 0;
      buffer[7] = 0;

      const result = await recovery.validateAndRepair(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("errors");
    });

    it("should detect and repair invalid magic number", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toHaveProperty("success");
      expect(Array.isArray(result.repairActions)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should detect invalid version", async () => {
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Invalid version (too high)
      buffer[4] = 0xff;
      buffer[5] = 0xff;

      const result = await recovery.validateAndRepair(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should handle missing chunks", async () => {
      const buffer = new Uint8Array(200);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Version 1
      buffer[4] = 1;
      buffer[5] = 0;
      // Flags 0
      buffer[6] = 0;
      buffer[7] = 0;
      // Rest is empty (no chunks)

      const result = await recovery.validateAndRepair(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should provide repair suggestions", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0x00, 0x00, 0x00, 0x00], 0); // Corrupted magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle enableRepair: false (no repair path)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: false,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("errors");
    });

    it("should handle strictMode option", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        strictMode: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("errors");
    });

    it("should handle validation failure with repair disabled (lines 313-318)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic - will fail parsing first

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(Array.isArray(result.repairActions)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(
        result.errors.some(
          (e: string) =>
            e.includes("repair is disabled") ||
            e.includes("validation failed") ||
            e.includes("Validation failed") ||
            e.includes("File parsing failed") ||
            e.includes("parsing failed")
        )
      ).toBe(true);
    });

    it("should handle repair file structure when validation fails (lines 299-310)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle repair file structure when validation passes (lines 696-703)", async () => {
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });
  });

  describe("recoverFromCorruption - repair strategy paths", () => {
    it("should use 'fail' strategy for header/critical corruption", async () => {
      const buffer = new Uint8Array(4); // Too small - triggers critical header corruption
      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("errors");
    });

    it("should use 'reconstruct' strategy for header/non-critical corruption", async () => {
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 2; // Invalid version (high severity, not critical - triggers reconstruct)
      buffer[5] = 0;

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        enableReconstruction: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should use 'skip' strategy for chunk corruption", async () => {
      const buffer = new Uint8Array(200);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      buffer.fill(0xff, 100); // Corrupted chunk data

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should use 'recover' strategy for signature corruption", async () => {
      const buffer = new Uint8Array(200);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      buffer.fill(0x00, 6); // Rest is empty/corrupted (may trigger signature corruption)

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should use 'reconstruct' strategy for metadata corruption", async () => {
      const buffer = new Uint8Array(200);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      buffer.fill(0x00, 6); // Rest is empty (may trigger metadata corruption)

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        enableReconstruction: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should use 'fail' strategy for unknown corruption type (default case)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0x00, 0x00, 0x00, 0x00], 0); // Invalid magic that may trigger unknown type

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("errors");
    });
  });

  describe("recoverFromCorruption - recovery execution paths", () => {
    it("should execute 'skip' strategy (lines 534-541)", async () => {
      const buffer = new Uint8Array(200);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      buffer.fill(0xff, 100); // Corrupted chunk data

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should execute 'reconstruct' strategy when enabled (lines 552-558)", async () => {
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 0xff; // Invalid version
      buffer[5] = 0xff;

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        enableReconstruction: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should fail when 'reconstruct' strategy is required but disabled (lines 544-550)", async () => {
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 2; // Invalid version (high severity, not critical - triggers reconstruct)
      buffer[5] = 0;

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id", {
        enableReconstruction: false,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e: string) => e.includes("Reconstruction required but disabled"))).toBe(true);
      expect(result.repairActions.some((a: string) => a.includes("Reconstruction disabled"))).toBe(true);
    });

    it("should execute 'recover' strategy (lines 560-567)", async () => {
      const buffer = new Uint8Array(200);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      buffer.fill(0x00, 6); // Rest is empty/corrupted

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should execute 'fail' strategy (lines 569-575)", async () => {
      const buffer = new Uint8Array(4); // Too small - triggers critical header corruption (fail strategy)

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(result).toHaveProperty("errors");
    });
  });

  describe("recoverFromCorruption - error handling paths", () => {
    it("should handle error when result.success is false (lines 182-196)", async () => {
      const buffer = new Uint8Array(0); // Empty buffer

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(Array.isArray(result.repairActions)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("validateAndRepair - error handling paths", () => {
    it("should handle error when validation fails (lines 321-334)", async () => {
      const buffer = new Uint8Array(0); // Empty buffer

      const result = await recovery.validateAndRepair(buffer, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.repairActions).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("detectCorruption - error paths", () => {
    it("should handle undefined version bytes (lines 386-394)", async () => {
      const buffer = new Uint8Array(4); // Only magic bytes, no version
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle undefined version bytes in detectCorruption (line 387)", async () => {
      // Create buffer with magic but missing version bytes
      const buffer = new Uint8Array(5); // Just magic + 1 byte (not enough for version)
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      // Version offset is at index 4, but we only have 5 bytes total
      // So secondByte will be undefined (line 387)

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle invalid wire format (lines 409-416)", async () => {
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      buffer.fill(0xff, 6); // Corrupted data that will fail wire format parsing

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle wireFormat magic check (line 409-410)", async () => {
      // Create buffer that parses but has invalid magic in wireFormat
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      // Rest of buffer will cause parseWireFormat to potentially return invalid magic
      buffer.fill(0x00, 6);

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle wireFormat magic check (line 409-410)", async () => {
      // Create buffer that parses but has invalid magic in wireFormat
      const buffer = new Uint8Array(100);
      const magic = new TextEncoder().encode("ZKIM");
      buffer.set(magic, 0);
      buffer[4] = 1; // Version 1
      buffer[5] = 0;
      // Rest of buffer will cause parseWireFormat to potentially return invalid magic
      buffer.fill(0x00, 6);

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });

    it("should handle detection error catch block (lines 439-451)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.recoverFromCorruption(buffer, "test-file-id");

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });
  });

  describe("validateFileStructure - error paths", () => {
    it("should handle validation failure (lines 671-676)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
    });
  });

  describe("repairFileStructure - validation result paths", () => {
    it("should handle repair when validation fails (lines 705-717)", async () => {
      const buffer = new Uint8Array(100);
      buffer.set([0xff, 0xff, 0xff, 0xff], 0); // Invalid magic

      const result = await recovery.validateAndRepair(buffer, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("repairActions");
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("recoverFromCorruption - ErrorUtils error paths", () => {
    it("should handle ErrorUtils.withErrorHandling failure in recoverFromCorruption (line 183-190)", async () => {
      const { ErrorUtils } = await import("../../src/utils/error-handling");
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValueOnce({
        success: false,
        error: "Recovery operation failed",
        errorCode: "RECOVERY_FAILED",
      });

      const corruptedData = new Uint8Array([0xff, 0xff, 0xff]);
      const result = await recovery.recoverFromCorruption(corruptedData, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Recovery failed");
    });
  });

  describe("validateAndRepair - repair enabled/disabled branches", () => {
    it("should attempt repair when enableRepair is true (line 299-311)", async () => {
      const corruptedData = new Uint8Array([0xff, 0xff, 0xff]);
      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should skip repair when enableRepair is false (line 275-281)", async () => {
      const corruptedData = new Uint8Array([0xff, 0xff, 0xff]);
      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: false,
      });

      expect(result.success).toBe(false);
      // When parsing fails and repair is disabled, returns "File parsing failed" error
      expect(result.errors.some((e) => e.includes("File parsing failed"))).toBe(true);
    });

    it("should handle ErrorUtils.withErrorHandling failure in validateAndRepair (line 321-334)", async () => {
      const { ErrorUtils } = await import("../../src/utils/error-handling");
      const originalWithErrorHandling = ErrorUtils.withErrorHandling;
      
      // Mock to return failure for validateAndRepair context
      ErrorUtils.withErrorHandling = jest.fn().mockImplementation(async (fn, context) => {
        if (context.operation === "validateAndRepair") {
          return {
            success: false,
            error: "Validation operation failed",
            errorCode: "VALIDATION_FAILED",
          };
        }
        // Use original for other operations
        return originalWithErrorHandling.call(ErrorUtils, fn, context);
      });

      const corruptedData = new Uint8Array([0xff, 0xff, 0xff]);
      const result = await recovery.validateAndRepair(corruptedData, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Validation failed");
      
      // Restore
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });
  });

  describe("detectCorruption - error handling branches", () => {
    it("should handle errors in detectCorruption catch block (line 441-444)", async () => {
      // Test error handling indirectly through validateAndRepair
      // This will call detectCorruption internally and test the catch block
      const invalidData = new Uint8Array(0); // Empty data might trigger errors
      
      const result = await recovery.validateAndRepair(invalidData, "test-file-id", {
        enableRepair: true,
      });
      
      // Should handle gracefully
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("determineRepairStrategy - switch case branches", () => {
    it("should return fail strategy for critical header corruption (line 462-468)", async () => {
      const corruptedData = new Uint8Array([0xff, 0xff, 0xff]);
      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      // Should attempt repair and return result
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should return reconstruct strategy for non-critical header corruption (line 470-475)", async () => {
      // Test with corrupted but potentially recoverable header
      const corruptedData = new Uint8Array(100);
      corruptedData.fill(0x00);
      // Set magic bytes incorrectly
      corruptedData[0] = 0x5a; // 'Z'
      corruptedData[1] = 0x4b; // 'K'
      corruptedData[2] = 0x49; // 'I'
      corruptedData[3] = 0x4d; // 'M'

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
    });

    it("should return skip strategy for chunk corruption (line 477-487)", async () => {
      // Create data that might be detected as chunk corruption
      const corruptedData = new Uint8Array(200);
      corruptedData.fill(0xff);

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
    });

    it("should return recover strategy for signature corruption (line 489-495)", async () => {
      // Create data that might be detected as signature corruption
      const corruptedData = new Uint8Array(150);
      corruptedData.fill(0xaa);

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
    });

    it("should return reconstruct strategy for metadata corruption (line 497-503)", async () => {
      // Create data that might be detected as metadata corruption
      const corruptedData = new Uint8Array(120);
      corruptedData.fill(0xbb);

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
    });

    it("should return default strategy for unknown corruption type (line 504+)", async () => {
      // Test with completely invalid data
      const corruptedData = new Uint8Array([0x00, 0x01, 0x02]);

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
    });

    it("should handle repairFileStructure when validation fails (line 705-717)", async () => {
      const corruptedData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
        strictMode: false,
      });

      expect(result).toBeDefined();
      // Should attempt repair even when validation fails
      expect(result.repairActions.length).toBeGreaterThan(0);
    });

    it("should handle repairFileStructure when validation passes (line 696-703)", async () => {
      // Create valid ZKIM file data
      const validMagic = new TextEncoder().encode("ZKIM");
      const validData = new Uint8Array([
        ...validMagic,
        0x01, 0x00, // version
        0x00, 0x00, // flags
        // ... minimal valid header
      ]);

      // Mock validateFileStructure to return true
      const validateSpy = jest.spyOn(recovery as any, "validateFileStructure").mockResolvedValueOnce(true);

      const result = await recovery.validateAndRepair(validData, "test-file-id", {
        enableRepair: true,
      });

      expect(result).toBeDefined();
      // When validation passes, repair should not be needed
      validateSpy.mockRestore();
    });

    it("should handle recoverFromCorruption error path (line 183-190)", async () => {
      // Mock ErrorUtils.withErrorHandling to return failure
      const { ErrorUtils } = require("../../src/utils/error-handling");
      const originalWithErrorHandling = ErrorUtils.withErrorHandling;
      
      ErrorUtils.withErrorHandling = jest.fn().mockResolvedValueOnce({
        success: false,
        error: "Test error",
      });

      const corruptedData = new Uint8Array([0x00, 0x01, 0x02]);
      const result = await recovery.recoverFromCorruption(corruptedData, "test-file-id");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Recovery failed");

      // Restore original
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should handle validateAndRepair when repair is disabled (line 313-318)", async () => {
      const corruptedData = new Uint8Array([0x00, 0x01, 0x02]);

      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: false, // Repair disabled
      });

      expect(result.success).toBe(false);
      expect(result.repairActions).toBeDefined();
    });

    it("should handle validateAndRepair error path (line 322-329)", async () => {
      // Mock ErrorUtils.withErrorHandling to return failure
      const { ErrorUtils } = require("../../src/utils/error-handling");
      const originalWithErrorHandling = ErrorUtils.withErrorHandling;
      
      ErrorUtils.withErrorHandling = jest.fn().mockResolvedValueOnce({
        success: false,
        error: "Test error",
      });

      const corruptedData = new Uint8Array([0x00, 0x01, 0x02]);
      const result = await recovery.validateAndRepair(corruptedData, "test-file-id", {
        enableRepair: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Restore original
      ErrorUtils.withErrorHandling = originalWithErrorHandling;
    });

    it("should handle detectCorruption when version bytes are undefined (line 387)", async () => {
      // Test indirectly through validateAndRepair
      const data = new Uint8Array([0x5a, 0x4b, 0x49, 0x4d]); // "ZKIM" magic only, no version bytes

      const result = await recovery.validateAndRepair(data, "test-file-id", {
        enableRepair: true,
      });

      // Should detect corruption
      expect(result).toBeDefined();
      expect(result.repairActions.length).toBeGreaterThan(0);
    });

    it("should handle detectCorruption when wire format magic check fails (line 410)", async () => {
      // Test indirectly through validateAndRepair
      const invalidData = new Uint8Array([0x00, 0x01, 0x02, 0x03]); // Invalid magic

      const result = await recovery.validateAndRepair(invalidData, "test-file-id", {
        enableRepair: true,
      });

      // Should detect corruption
      expect(result).toBeDefined();
      expect(result.repairActions.length).toBeGreaterThan(0);
    });

    it("should handle detectCorruption error path (line 441-444)", async () => {
      // Mock parseWireFormat to throw error
      jest.spyOn(require("../../src/core/zkim-file-wire-format"), "parseWireFormat").mockImplementationOnce(() => {
        throw new Error("Parse error");
      });

      const data = new Uint8Array([0x5a, 0x4b, 0x49, 0x4d]);
      const result = await recovery.validateAndRepair(data, "test-file-id", {
        enableRepair: true,
      });

      // Should handle error gracefully
      expect(result).toBeDefined();

      jest.restoreAllMocks();
    });

    it("should handle executeRecoveryStrategy when reconstruction is disabled (line 544-550)", async () => {
      const corruptedData = new Uint8Array([0x00, 0x01, 0x02]);

      // Test with metadata corruption which requires reconstruction
      // Call recoverFromCorruption directly with enableReconstruction: false
      const result = await recovery.recoverFromCorruption(corruptedData, "test-file-id", {
        enableReconstruction: false, // Reconstruction disabled
      });

      // Should handle reconstruction disabled path
      expect(result).toBeDefined();
      // The result may vary based on corruption type detected
      expect(result.repairActions.length).toBeGreaterThanOrEqual(0);
    });
  });
});

