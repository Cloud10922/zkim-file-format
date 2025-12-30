/**
 * Constant-Time Security Utilities Unit Tests
 * Tests for timing attack prevention utilities
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  ConstantTimeSecurity,
  constantTimeStringCompare,
  constantTimeByteCompare,
  constantTimeArrayIncludes,
  constantTimeStringArrayIncludes,
  validateMagicNumber,
  validateVersion,
  validateSize,
  withTimingProtection,
  addSecureDelay,
} from "../../src/utils/constant-time-security";
import sodium from "libsodium-wrappers-sumo";

describe("ConstantTimeSecurity", () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  describe("constantTimeStringCompare", () => {
    it("should return true for identical strings", () => {
      const result = ConstantTimeSecurity.constantTimeStringCompare("test", "test");
      expect(result).toBe(true);
    });

    it("should return false for different strings", () => {
      const result = ConstantTimeSecurity.constantTimeStringCompare("test", "fail");
      expect(result).toBe(false);
    });

    it("should return false for strings with different lengths", () => {
      const result = ConstantTimeSecurity.constantTimeStringCompare("test", "testing");
      expect(result).toBe(false);
    });

    it("should return false for empty string vs non-empty", () => {
      const result = ConstantTimeSecurity.constantTimeStringCompare("", "test");
      expect(result).toBe(false);
    });

    it("should return true for empty strings", () => {
      const result = ConstantTimeSecurity.constantTimeStringCompare("", "");
      expect(result).toBe(true);
    });

    it("should handle strings with special characters", () => {
      const result = ConstantTimeSecurity.constantTimeStringCompare("test@123", "test@123");
      expect(result).toBe(true);
    });
  });

  describe("constantTimeByteCompare", () => {
    it("should return true for identical byte arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 4]);
      const result = ConstantTimeSecurity.constantTimeByteCompare(a, b);
      expect(result).toBe(true);
    });

    it("should return false for different byte arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 5]);
      const result = ConstantTimeSecurity.constantTimeByteCompare(a, b);
      expect(result).toBe(false);
    });

    it("should return false for arrays with different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      const result = ConstantTimeSecurity.constantTimeByteCompare(a, b);
      expect(result).toBe(false);
    });

    it("should return true for empty arrays", () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);
      const result = ConstantTimeSecurity.constantTimeByteCompare(a, b);
      expect(result).toBe(true);
    });

    it("should handle large arrays", () => {
      const a = new Uint8Array(1000).fill(42);
      const b = new Uint8Array(1000).fill(42);
      const result = ConstantTimeSecurity.constantTimeByteCompare(a, b);
      expect(result).toBe(true);
    });
  });

  describe("constantTimeArrayIncludes", () => {
    it("should return true when array contains target", () => {
      const array = [1, 2, 3, 4, 5];
      const result = ConstantTimeSecurity.constantTimeArrayIncludes(array, 3);
      expect(result).toBe(true);
    });

    it("should return false when array does not contain target", () => {
      const array = [1, 2, 3, 4, 5];
      const result = ConstantTimeSecurity.constantTimeArrayIncludes(array, 99);
      expect(result).toBe(false);
    });

    it("should handle empty arrays", () => {
      const array: number[] = [];
      const result = ConstantTimeSecurity.constantTimeArrayIncludes(array, 1);
      expect(result).toBe(false);
    });

    it("should use custom compare function", () => {
      const array = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = ConstantTimeSecurity.constantTimeArrayIncludes(
        array,
        { id: 2 },
        (a, b) => a.id === b.id
      );
      expect(result).toBe(true);
    });

    it("should handle arrays with undefined elements", () => {
      const array = [1, undefined, 3, 4, 5];
      const result = ConstantTimeSecurity.constantTimeArrayIncludes(array, 3);
      expect(result).toBe(true);
    });
  });

  describe("constantTimeStringArrayIncludes", () => {
    it("should return true when array contains target string", () => {
      const array = ["apple", "banana", "cherry"];
      const result = ConstantTimeSecurity.constantTimeStringArrayIncludes(array, "banana");
      expect(result).toBe(true);
    });

    it("should return false when array does not contain target", () => {
      const array = ["apple", "banana", "cherry"];
      const result = ConstantTimeSecurity.constantTimeStringArrayIncludes(array, "grape");
      expect(result).toBe(false);
    });

    it("should handle empty arrays", () => {
      const array: string[] = [];
      const result = ConstantTimeSecurity.constantTimeStringArrayIncludes(array, "test");
      expect(result).toBe(false);
    });
  });

  describe("constantTimeLengthCheck", () => {
    it("should return true for correct string length", () => {
      const result = ConstantTimeSecurity.constantTimeLengthCheck("test", 4);
      expect(result).toBe(true);
    });

    it("should return false for incorrect string length", () => {
      const result = ConstantTimeSecurity.constantTimeLengthCheck("test", 5);
      expect(result).toBe(false);
    });

    it("should return true for correct Uint8Array length", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const result = ConstantTimeSecurity.constantTimeLengthCheck(data, 4);
      expect(result).toBe(true);
    });

    it("should return false for incorrect Uint8Array length", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const result = ConstantTimeSecurity.constantTimeLengthCheck(data, 5);
      expect(result).toBe(false);
    });
  });

  describe("addSecureDelay", () => {
    it("should add delay", async () => {
      const startTime = performance.now();
      await ConstantTimeSecurity.addSecureDelay(10);
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it("should add delay with default base time", async () => {
      const startTime = performance.now();
      await ConstantTimeSecurity.addSecureDelay();
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it("should handle firstByte undefined branch (line 173-175)", async () => {
      // This branch is difficult to test because randomBytes[0] should always be defined
      // But we can test the error handling path by mocking sodium.randombytes_buf
      const originalRandomBytes = sodium.randombytes_buf;
      
      // Mock to return empty array (which would make [0] undefined)
      (sodium as any).randombytes_buf = jest.fn(() => new Uint8Array(0));
      
      await expect(ConstantTimeSecurity.addSecureDelay(10)).rejects.toThrow(
        "Failed to generate random bytes"
      );
      
      // Restore
      (sodium as any).randombytes_buf = originalRandomBytes;
    });
  });

  describe("withTimingProtection", () => {
    it("should execute operation and return result", async () => {
      const operation = async () => "test result";
      const result = await ConstantTimeSecurity.withTimingProtection(operation);
      expect(result).toBe("test result");
    });

    it("should execute synchronous operation", async () => {
      const operation = () => "sync result";
      const result = await ConstantTimeSecurity.withTimingProtection(operation);
      expect(result).toBe("sync result");
    });

    it("should add delay if operation is too fast", async () => {
      const operation = () => "fast";
      const startTime = performance.now();
      await ConstantTimeSecurity.withTimingProtection(operation, 20, 100);
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(15); // Should be at least close to minTime
    });

    it("should maintain timing even on error", async () => {
      const operation = () => {
        throw new Error("test error");
      };

      await expect(
        ConstantTimeSecurity.withTimingProtection(operation, 20, 100)
      ).rejects.toThrow("test error");
    });
  });

  describe("validateMagicNumber", () => {
    it("should return true for valid magic number", () => {
      const result = ConstantTimeSecurity.validateMagicNumber("ZKIM", "ZKIM");
      expect(result).toBe(true);
    });

    it("should return false for invalid magic number", () => {
      const result = ConstantTimeSecurity.validateMagicNumber("INVALID", "ZKIM");
      expect(result).toBe(false);
    });

    it("should use default expected value", () => {
      const result = ConstantTimeSecurity.validateMagicNumber("ZKIM");
      expect(result).toBe(true);
    });
  });

  describe("validateVersion", () => {
    it("should return true for valid version", () => {
      const result = ConstantTimeSecurity.validateVersion(1, 1, 1, 255);
      expect(result).toBe(true);
    });

    it("should return false for version mismatch", () => {
      const result = ConstantTimeSecurity.validateVersion(2, 1, 1, 255);
      expect(result).toBe(false);
    });

    it("should return false for version out of range", () => {
      const result = ConstantTimeSecurity.validateVersion(0, 1, 1, 255);
      expect(result).toBe(false);
    });

    it("should return false for version above max", () => {
      const result = ConstantTimeSecurity.validateVersion(256, 1, 1, 255);
      expect(result).toBe(false);
    });
  });

  describe("validateSize", () => {
    it("should return true for exact size match", () => {
      const result = ConstantTimeSecurity.validateSize(100, 100, 1024);
      expect(result).toBe(true);
    });

    it("should return true for size within tolerance", () => {
      const result = ConstantTimeSecurity.validateSize(100, 150, 1024);
      expect(result).toBe(true);
    });

    it("should return false for size outside tolerance", () => {
      const result = ConstantTimeSecurity.validateSize(100, 2000, 1024);
      expect(result).toBe(false);
    });

    it("should handle default tolerance", () => {
      const result = ConstantTimeSecurity.validateSize(100, 100);
      expect(result).toBe(true);
    });
  });

  describe("secureCompare", () => {
    it("should return true for equal values", () => {
      const result = ConstantTimeSecurity.secureCompare("test", "test", "test-context");
      expect(result).toBe(true);
    });

    it("should return false for different values", () => {
      const result = ConstantTimeSecurity.secureCompare("test", "fail", "test-context");
      expect(result).toBe(false);
    });

    it("should use custom compare function", () => {
      const result = ConstantTimeSecurity.secureCompare(
        { id: 1 },
        { id: 1 },
        "test-context",
        (a, b) => a.id === b.id
      );
      expect(result).toBe(true);
    });
  });

  describe("detectTimingAttack", () => {
    it("should return false for insufficient data", () => {
      const times = [10, 20, 30];
      const result = ConstantTimeSecurity.detectTimingAttack(times);
      expect(result).toBe(false);
    });

    it("should return false for normal variance", () => {
      // Use times with high variance (stdDev > 50ms threshold)
      // Fixed values to ensure high variance: range from 50ms to 250ms
      const times = [50, 100, 150, 200, 250, 80, 120, 180, 90, 210, 70, 130, 170, 110, 190, 60, 140, 160, 95, 205];
      const result = ConstantTimeSecurity.detectTimingAttack(times, 50);
      expect(result).toBe(false);
    });

    it("should detect suspiciously consistent timing", () => {
      const times = Array.from({ length: 20 }, () => 50); // All exactly 50ms
      const result = ConstantTimeSecurity.detectTimingAttack(times, 50);
      expect(result).toBe(true);
    });
  });

  describe("Exported utility functions", () => {
    it("should export constantTimeStringCompare", () => {
      expect(constantTimeStringCompare("test", "test")).toBe(true);
      expect(constantTimeStringCompare("test", "fail")).toBe(false);
    });

    it("should export constantTimeByteCompare", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(constantTimeByteCompare(a, b)).toBe(true);
    });

    it("should export constantTimeArrayIncludes", () => {
      const array = [1, 2, 3];
      expect(constantTimeArrayIncludes(array, 2)).toBe(true);
      expect(constantTimeArrayIncludes(array, 99)).toBe(false);
    });

    it("should export constantTimeStringArrayIncludes", () => {
      const array = ["a", "b", "c"];
      expect(constantTimeStringArrayIncludes(array, "b")).toBe(true);
      expect(constantTimeStringArrayIncludes(array, "z")).toBe(false);
    });

    it("should export validateMagicNumber", () => {
      expect(validateMagicNumber("ZKIM")).toBe(true);
      expect(validateMagicNumber("INVALID")).toBe(false);
    });

    it("should export validateVersion", () => {
      expect(validateVersion(1, 1, 1, 255)).toBe(true);
      expect(validateVersion(2, 1, 1, 255)).toBe(false);
    });

    it("should export validateSize", () => {
      expect(validateSize(100, 100, 1024)).toBe(true);
      expect(validateSize(100, 2000, 1024)).toBe(false);
    });

    it("should export withTimingProtection", async () => {
      const result = await withTimingProtection(() => "test");
      expect(result).toBe("test");
    });

    it("should export addSecureDelay", async () => {
      const startTime = performance.now();
      await addSecureDelay(10);
      const endTime = performance.now();
      expect(endTime - startTime).toBeGreaterThanOrEqual(10);
    });
  });
});

