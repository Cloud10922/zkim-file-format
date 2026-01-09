/**
 * Compression Utilities Tests
 * Tests for compression/decompression functions
 */

import { describe, it, expect } from "@jest/globals";
import { compressGzip, decompressGzip } from "../../src/utils/compression-utils";

describe("Compression Utilities", () => {
  describe("compressGzip / decompressGzip", () => {
    it("should compress and decompress data", async () => {
      const data = new TextEncoder().encode("test data to compress");
      const compressed = await compressGzip(data);
      expect(compressed).toBeInstanceOf(Uint8Array);
      // For small data, compression overhead might make it larger
      // Just verify it's a valid Uint8Array

      const decompressed = await decompressGzip(compressed);
      expect(decompressed).toEqual(data);
    });

    it("should handle empty data", async () => {
      const data = new Uint8Array(0);
      const compressed = await compressGzip(data);
      const decompressed = await decompressGzip(compressed);
      expect(decompressed).toEqual(data);
    });

    it("should handle large data", async () => {
      const largeData = new Uint8Array(10000).fill(65); // 10KB of 'A'
      const compressed = await compressGzip(largeData);
      expect(compressed.length).toBeLessThan(largeData.length);

      const decompressed = await decompressGzip(compressed);
      expect(decompressed).toEqual(largeData);
    });

    it("should handle repetitive data (highly compressible)", async () => {
      const repetitiveData = new TextEncoder().encode("A".repeat(1000));
      const compressed = await compressGzip(repetitiveData);
      expect(compressed.length).toBeLessThan(repetitiveData.length);

      const decompressed = await decompressGzip(compressed);
      expect(decompressed).toEqual(repetitiveData);
    });

    it("should handle random data (low compressibility)", async () => {
      const randomData = new Uint8Array(1000);
      for (let i = 0; i < randomData.length; i++) {
        randomData[i] = Math.floor(Math.random() * 256);
      }
      const compressed = await compressGzip(randomData);
      const decompressed = await decompressGzip(compressed);
      expect(decompressed).toEqual(randomData);
    });

    it("should handle unicode data", async () => {
      const unicodeData = new TextEncoder().encode("Hello 世界 🌍");
      const compressed = await compressGzip(unicodeData);
      const decompressed = await decompressGzip(compressed);
      expect(decompressed).toEqual(unicodeData);
    });
  });
});

