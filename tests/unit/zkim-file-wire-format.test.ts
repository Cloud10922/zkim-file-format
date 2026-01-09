/**
 * ZKIM File Wire Format Tests
 * Tests for wire format utilities
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
import {
  writeU16,
  readU16,
  formatEhHeader,
  parseEhHeader,
  calculateMerkleRoot,
  calculateManifestHash,
} from "../../src/core/zkim-file-wire-format";
import { ServiceError } from "../../src/types/errors";
import type { ZkimFileChunk } from "../../src/types/zkim-file-format";
import { ZKIM_ENCRYPTION_CONSTANTS } from "../../src/constants";

describe("ZKIM File Wire Format", () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  describe("writeU16 / readU16", () => {
    it("should write and read u16 values", () => {
      const value = 0x1234;
      const bytes = writeU16(value);
      expect(bytes.length).toBe(2);
      const readValue = readU16(bytes, 0);
      expect(readValue).toBe(value);
    });

    it("should handle zero value", () => {
      const bytes = writeU16(0);
      expect(readU16(bytes, 0)).toBe(0);
    });

    it("should handle max u16 value", () => {
      const value = 0xffff;
      const bytes = writeU16(value);
      expect(readU16(bytes, 0)).toBe(value);
    });

    it("should throw error for buffer too short", () => {
      const buffer = new Uint8Array([1]);
      expect(() => readU16(buffer, 0)).toThrow(ServiceError);
    });
  });

  describe("formatEhHeader / parseEhHeader", () => {
    it("should format and parse EH header", () => {
      const nonce = sodium.randombytes_buf(ZKIM_ENCRYPTION_CONSTANTS.NONCE_SIZE);
      const tag = sodium.randombytes_buf(ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE);
      const ciphertext = sodium.randombytes_buf(100);
      const encryptedData = new Uint8Array([...ciphertext, ...tag]);

      const header = formatEhHeader(nonce, encryptedData);
      expect(header.length).toBe(40); // nonce24 + tag16

      const parsed = parseEhHeader(header);
      expect(parsed.nonce).toEqual(nonce);
      expect(parsed.tag.length).toBe(ZKIM_ENCRYPTION_CONSTANTS.TAG_SIZE);
    });

    it("should throw error for invalid nonce length", () => {
      const invalidNonce = new Uint8Array(20);
      const data = new Uint8Array(100);
      expect(() => formatEhHeader(invalidNonce, data)).toThrow(ServiceError);
    });
  });

  describe("calculateMerkleRoot", () => {
    it("should calculate Merkle root for chunks", () => {
      const chunks: ZkimFileChunk[] = [
        {
          chunkIndex: 0,
          chunkSize: 100,
          compressedSize: 100,
          encryptedSize: 120,
          nonce: new Uint8Array(24),
          encryptedData: new Uint8Array(120),
          integrityHash: new Uint8Array(32).fill(1),
          padding: new Uint8Array(0),
        },
        {
          chunkIndex: 1,
          chunkSize: 100,
          compressedSize: 100,
          encryptedSize: 120,
          nonce: new Uint8Array(24),
          encryptedData: new Uint8Array(120),
          integrityHash: new Uint8Array(32).fill(2),
          padding: new Uint8Array(0),
        },
      ];

      const root = calculateMerkleRoot(chunks);
      expect(root).toBeInstanceOf(Uint8Array);
      expect(root.length).toBe(32);
    });

    it("should handle empty chunks array", () => {
      const root = calculateMerkleRoot([]);
      expect(root).toBeInstanceOf(Uint8Array);
      expect(root.length).toBe(32);
    });
  });

  describe("calculateManifestHash", () => {
    it("should calculate manifest hash", () => {
      const ehUser = new Uint8Array(100);
      const hash = calculateManifestHash(ehUser);
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });
  });
});
