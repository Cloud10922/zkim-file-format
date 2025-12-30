/**
 * Compression Utils Unit Tests
 * Comprehensive test suite for compression utilities
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "@jest/globals";
import { compressGzip, decompressGzip } from "../../src/utils/compression-utils";
import { ServiceError } from "../../src/types/errors";
import { ErrorUtils } from "../../src/utils/error-handling";

describe("Compression Utils", () => {
  beforeAll(async () => {
    // Ensure Node.js environment is ready
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.restoreAllMocks();
  });

  afterEach(() => {
    // Restore all mocks after each test
    jest.restoreAllMocks();
  });

  describe("compressGzip", () => {
    it("should compress data successfully", async () => {
      const data = new TextEncoder().encode("Test data for compression");
      const compressed = await compressGzip(data);

      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
      // Compressed data should be different from original
      expect(compressed).not.toEqual(data);
    });

    it("should compress with default compression level", async () => {
      const data = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(data);

      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("should compress with custom compression level", async () => {
      const data = new TextEncoder().encode("Test data for custom level");
      const compressed = await compressGzip(data, 9); // Maximum compression

      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0);
    });

    it("should clamp compression level to valid range (0-9)", async () => {
      const data = new TextEncoder().encode("Test data");

      // Test level below minimum (should clamp to 0)
      const compressedLow = await compressGzip(data, -5);
      expect(compressedLow).toBeInstanceOf(Uint8Array);

      // Test level above maximum (should clamp to 9)
      const compressedHigh = await compressGzip(data, 15);
      expect(compressedHigh).toBeInstanceOf(Uint8Array);
    });

    it("should handle empty data", async () => {
      const data = new Uint8Array(0);
      const compressed = await compressGzip(data);

      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeGreaterThan(0); // GZIP header adds overhead
    });

    it("should handle large data", async () => {
      const largeData = new Uint8Array(100 * 1024); // 100KB
      largeData.fill(0x42);

      const compressed = await compressGzip(largeData);

      expect(compressed).toBeInstanceOf(Uint8Array);
      expect(compressed.length).toBeLessThan(largeData.length); // Should compress well
    });

    it("should handle repetitive data (highly compressible)", async () => {
      const repetitiveData = new TextEncoder().encode("A".repeat(1000));
      const compressed = await compressGzip(repetitiveData);

      expect(compressed).toBeInstanceOf(Uint8Array);
      // Repetitive data should compress significantly
      expect(compressed.length).toBeLessThan(repetitiveData.length);
    });

    it("should handle random data (low compressibility)", async () => {
      const randomData = new Uint8Array(1000);
      // Fill with pseudo-random data
      for (let i = 0; i < randomData.length; i++) {
        randomData[i] = (i * 7 + 13) % 256;
      }

      const compressed = await compressGzip(randomData);

      expect(compressed).toBeInstanceOf(Uint8Array);
      // Random data may not compress much, but should still produce valid output
      expect(compressed.length).toBeGreaterThan(0);
    });
  });

  describe("decompressGzip", () => {
    it("should decompress data successfully", async () => {
      const original = new TextEncoder().encode("Test data for decompression");
      const compressed = await compressGzip(original);
      const decompressed = await decompressGzip(compressed);

      expect(decompressed).toBeInstanceOf(Uint8Array);
      expect(decompressed).toEqual(original);
    });

    it("should decompress with original size validation", async () => {
      const original = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(original);
      const decompressed = await decompressGzip(compressed, original.length);

      expect(decompressed).toEqual(original);
    });

    it("should handle decompression of empty compressed data", async () => {
      const emptyData = new Uint8Array(0);
      const compressed = await compressGzip(emptyData);
      const decompressed = await decompressGzip(compressed);

      expect(decompressed).toBeInstanceOf(Uint8Array);
      expect(decompressed.length).toBe(0);
    });

    it("should handle decompression of large compressed data", async () => {
      const largeData = new Uint8Array(100 * 1024); // 100KB
      largeData.fill(0x42);
      const compressed = await compressGzip(largeData);
      const decompressed = await decompressGzip(compressed);

      expect(decompressed).toBeInstanceOf(Uint8Array);
      expect(decompressed).toEqual(largeData);
    });

    it("should handle decompression with size mismatch warning", async () => {
      const original = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(original);
      // Provide wrong original size
      const decompressed = await decompressGzip(compressed, original.length * 2);

      expect(decompressed).toBeInstanceOf(Uint8Array);
      // Should still decompress correctly despite size mismatch
      expect(decompressed).toEqual(original);
    });

    it("should round-trip compress and decompress correctly", async () => {
      const original = new TextEncoder().encode("Round trip test data");
      const compressed = await compressGzip(original);
      const decompressed = await decompressGzip(compressed);

      expect(decompressed).toEqual(original);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid compressed data gracefully", async () => {
      const invalidData = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

      await expect(decompressGzip(invalidData)).rejects.toThrow();
    });

    it("should handle corrupted compressed data", async () => {
      const original = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(original);
      // Corrupt the compressed data
      compressed[10] = 0xff;
      compressed[11] = 0xff;

      await expect(decompressGzip(compressed)).rejects.toThrow();
    });

    it("should handle ErrorUtils.withErrorHandling failure in compressGzip (line 188-199)", async () => {
      // Mock ErrorUtils to return failure
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: false,
        error: "Compression operation failed",
        errorCode: "GZIP_COMPRESSION_FAILED",
      });

      const data = new TextEncoder().encode("Test data");
      await expect(compressGzip(data)).rejects.toThrow(ServiceError);
      await expect(compressGzip(data)).rejects.toMatchObject({
        code: "GZIP_COMPRESSION_FAILED",
      });
    });

    it("should handle undefined result.data in compressGzip (line 195-199)", async () => {
      // Mock ErrorUtils to return success but no data
      jest.spyOn(ErrorUtils, "withErrorHandling").mockResolvedValue({
        success: true,
        data: undefined,
      });

      const data = new TextEncoder().encode("Test data");
      await expect(compressGzip(data)).rejects.toThrow(ServiceError);
      await expect(compressGzip(data)).rejects.toMatchObject({
        code: "COMPRESSION_DATA_MISSING",
      });
    });

    it("should handle ErrorUtils.withErrorHandling failure in decompressGzip (line 276-287)", async () => {
      const original = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(original);

      // Mock ErrorUtils to return failure for decompression only
      jest.spyOn(ErrorUtils, "withErrorHandling").mockImplementation(async (fn, context) => {
        // Only mock for decompressGzip context
        if (context.operation === "decompressGzip") {
          return {
            success: false,
            error: "Decompression operation failed",
            errorCode: "GZIP_DECOMPRESSION_FAILED",
          };
        }
        // Use real implementation for other operations
        return ErrorUtils.withErrorHandling(fn, context);
      });

      await expect(decompressGzip(compressed)).rejects.toThrow(ServiceError);
      await expect(decompressGzip(compressed)).rejects.toMatchObject({
        code: "GZIP_DECOMPRESSION_FAILED",
      });
    });

    it("should handle undefined result.data in decompressGzip (line 283-287)", async () => {
      const original = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(original);

      // Mock ErrorUtils to return success but no data for decompression only
      jest.spyOn(ErrorUtils, "withErrorHandling").mockImplementation(async (fn, context) => {
        if (context.operation === "decompressGzip") {
          return {
            success: true,
            data: undefined,
          };
        }
        // Use real implementation for other operations
        return ErrorUtils.withErrorHandling(fn, context);
      });

      await expect(decompressGzip(compressed)).rejects.toThrow(ServiceError);
      await expect(decompressGzip(compressed)).rejects.toMatchObject({
        code: "DECOMPRESSION_DATA_MISSING",
      });
    });

    it("should handle originalSize validation in decompressGzip (line 226-232, 266-271)", async () => {
      const original = new TextEncoder().encode("Test data");
      const compressed = await compressGzip(original);

      // Test with correct originalSize (should not warn)
      const decompressed1 = await decompressGzip(compressed, original.length);
      expect(decompressed1).toEqual(original);

      // Test with incorrect originalSize (should warn but still work)
      const decompressed2 = await decompressGzip(compressed, original.length * 2);
      expect(decompressed2).toEqual(original);

      // Test without originalSize (should work)
      const decompressed3 = await decompressGzip(compressed);
      expect(decompressed3).toEqual(original);
    });

    it("should handle originalSize mismatch warning in decompressGzip (Node.js zlib path)", async () => {
      const original = new TextEncoder().encode("Test data for size validation");
      const compressed = await compressGzip(original);

      // In Node.js, zlib is used, so test the size mismatch warning path
      // Provide wrong originalSize to trigger warning
      const decompressed = await decompressGzip(compressed, original.length + 100);

      expect(decompressed).toEqual(original);
      // Warning should be logged but decompression should still work
    });

    it("should handle originalSize validation when provided (line 226-232)", async () => {
      const original = new TextEncoder().encode("Test data for size check");
      const compressed = await compressGzip(original);

      // Test with correct originalSize - should not warn
      const decompressed1 = await decompressGzip(compressed, original.length);
      expect(decompressed1).toEqual(original);

      // Test with incorrect originalSize - should warn but still work
      const decompressed2 = await decompressGzip(compressed, original.length + 50);
      expect(decompressed2).toEqual(original);
    });
  });
});

