/**
 * Crypto Utilities Unit Tests
 * Tests for environment-agnostic crypto utilities
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  generateRandomBytes,
  generateRandomHex,
  hashData,
  hashDataToHex,
  generateKeyPair,
  generateSigningKeyPair,
  encryptData,
  decryptData,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
} from "../../src/utils/crypto";
import { TEST_CONTENT_SMALL, TEST_CONTENT_MEDIUM } from "../fixtures/test-data";
import sodium from "libsodium-wrappers-sumo";

describe("Crypto Utilities", () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  describe("generateRandomBytes", () => {
    it("should generate random bytes of specified length", async () => {
      const bytes = await generateRandomBytes(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it("should generate different random bytes on each call", async () => {
      const bytes1 = await generateRandomBytes(32);
      const bytes2 = await generateRandomBytes(32);
      expect(bytes1).not.toEqual(bytes2);
    });

    it("should handle different lengths", async () => {
      const bytes16 = await generateRandomBytes(16);
      const bytes64 = await generateRandomBytes(64);
      expect(bytes16.length).toBe(16);
      expect(bytes64.length).toBe(64);
    });
  });

  describe("generateRandomHex", () => {
    it("should generate random hex string of specified length", async () => {
      const hex = await generateRandomHex(32);
      expect(typeof hex).toBe("string");
      expect(hex.length).toBe(32);
      expect(hex).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should generate different hex strings on each call", async () => {
      const hex1 = await generateRandomHex(32);
      const hex2 = await generateRandomHex(32);
      expect(hex1).not.toBe(hex2);
    });

    it("should handle odd length", async () => {
      const hex = await generateRandomHex(31);
      expect(hex.length).toBe(31);
      expect(hex).toMatch(/^[0-9a-f]{31}$/);
    });
  });

  describe("hashData", () => {
    it("should hash data with default output length", () => {
      const hash = hashData(TEST_CONTENT_SMALL);
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32); // Default BLAKE3 output length
    });

    it("should hash data with custom output length", () => {
      const hash16 = hashData(TEST_CONTENT_SMALL, 16);
      const hash64 = hashData(TEST_CONTENT_SMALL, 64);
      expect(hash16.length).toBe(16);
      expect(hash64.length).toBe(64);
    });

    it("should produce same hash for same input", () => {
      const hash1 = hashData(TEST_CONTENT_SMALL);
      const hash2 = hashData(TEST_CONTENT_SMALL);
      expect(hash1).toEqual(hash2);
    });

    it("should produce different hash for different input", () => {
      const hash1 = hashData(TEST_CONTENT_SMALL);
      const hash2 = hashData(TEST_CONTENT_MEDIUM);
      expect(hash1).not.toEqual(hash2);
    });

    it("should handle empty data", () => {
      const emptyData = new Uint8Array(0);
      const hash = hashData(emptyData);
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });
  });

  describe("hashDataToHex", () => {
    it("should hash data and return hex string", () => {
      const hex = hashDataToHex(TEST_CONTENT_SMALL);
      expect(typeof hex).toBe("string");
      expect(hex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should hash data with custom output length", () => {
      const hex16 = hashDataToHex(TEST_CONTENT_SMALL, 16);
      const hex64 = hashDataToHex(TEST_CONTENT_SMALL, 64);
      expect(hex16.length).toBe(32); // 16 bytes = 32 hex chars
      expect(hex64.length).toBe(128); // 64 bytes = 128 hex chars
    });

    it("should produce same hex for same input", () => {
      const hex1 = hashDataToHex(TEST_CONTENT_SMALL);
      const hex2 = hashDataToHex(TEST_CONTENT_SMALL);
      expect(hex1).toBe(hex2);
    });
  });

  describe("generateKeyPair", () => {
    it("should generate X25519 key pair", async () => {
      const keyPair = await generateKeyPair();
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });

    it("should generate different key pairs on each call", async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    });
  });

  describe("generateSigningKeyPair", () => {
    it("should generate Ed25519 signing key pair", async () => {
      const keyPair = await generateSigningKeyPair();
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(64); // Ed25519 private key is 64 bytes
    });

    it("should generate different signing key pairs on each call", async () => {
      const keyPair1 = await generateSigningKeyPair();
      const keyPair2 = await generateSigningKeyPair();
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    });
  });

  describe("encryptData", () => {
    it("should encrypt data with XChaCha20-Poly1305", async () => {
      const key = await generateRandomBytes(32);
      const result = await encryptData(TEST_CONTENT_SMALL, key);

      expect(result).toBeDefined();
      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.nonce).toBeInstanceOf(Uint8Array);
      expect(result.nonce.length).toBe(24);
      expect(result.ciphertext).not.toEqual(TEST_CONTENT_SMALL);
    });

    it("should encrypt with provided nonce", async () => {
      const key = await generateRandomBytes(32);
      const nonce = await generateRandomBytes(24);
      const result = await encryptData(TEST_CONTENT_SMALL, key, nonce);

      expect(result.nonce).toEqual(nonce);
    });

    it("should generate different ciphertexts for same plaintext", async () => {
      const key = await generateRandomBytes(32);
      const result1 = await encryptData(TEST_CONTENT_SMALL, key);
      const result2 = await encryptData(TEST_CONTENT_SMALL, key);

      // Different nonces should produce different ciphertexts
      expect(result1.nonce).not.toEqual(result2.nonce);
      expect(result1.ciphertext).not.toEqual(result2.ciphertext);
    });

    it("should handle empty data", async () => {
      const key = await generateRandomBytes(32);
      const emptyData = new Uint8Array(0);
      const result = await encryptData(emptyData, key);

      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.ciphertext.length).toBeGreaterThan(0); // AEAD adds overhead
    });
  });

  describe("decryptData", () => {
    it("should decrypt data correctly", async () => {
      const key = await generateRandomBytes(32);
      const encrypted = await encryptData(TEST_CONTENT_SMALL, key);

      const decrypted = await decryptData(encrypted.ciphertext, key, encrypted.nonce);
      expect(decrypted).toEqual(TEST_CONTENT_SMALL);
    });

    it("should fail with wrong key", async () => {
      const key = await generateRandomBytes(32);
      const wrongKey = await generateRandomBytes(32);
      const encrypted = await encryptData(TEST_CONTENT_SMALL, key);

      await expect(
        decryptData(encrypted.ciphertext, wrongKey, encrypted.nonce)
      ).rejects.toThrow();
    });

    it("should fail with wrong nonce", async () => {
      const key = await generateRandomBytes(32);
      const encrypted = await encryptData(TEST_CONTENT_SMALL, key);
      const wrongNonce = await generateRandomBytes(24);

      await expect(
        decryptData(encrypted.ciphertext, key, wrongNonce)
      ).rejects.toThrow();
    });

    it("should fail with corrupted ciphertext", async () => {
      const key = await generateRandomBytes(32);
      const encrypted = await encryptData(TEST_CONTENT_SMALL, key);
      const corrupted = new Uint8Array(encrypted.ciphertext);
      corrupted[0] = corrupted[0]! ^ 0xff;

      await expect(decryptData(corrupted, key, encrypted.nonce)).rejects.toThrow();
    });
  });

  describe("toBase64 / fromBase64", () => {
    it("should convert Uint8Array to base64 and back", async () => {
      const original = TEST_CONTENT_SMALL;
      const base64 = await toBase64(original);
      const decoded = await fromBase64(base64);

      expect(typeof base64).toBe("string");
      expect(decoded).toEqual(original);
    });

    it("should handle empty data", async () => {
      const empty = new Uint8Array(0);
      const base64 = await toBase64(empty);
      const decoded = await fromBase64(base64);

      expect(decoded).toEqual(empty);
    });

    it("should handle large data", async () => {
      const large = TEST_CONTENT_MEDIUM;
      const base64 = await toBase64(large);
      const decoded = await fromBase64(base64);

      expect(decoded).toEqual(large);
    });
  });

  describe("toHex / fromHex", () => {
    it("should convert Uint8Array to hex and back", async () => {
      const original = TEST_CONTENT_SMALL;
      const hex = await toHex(original);
      const decoded = await fromHex(hex);

      expect(typeof hex).toBe("string");
      expect(hex).toMatch(/^[0-9a-f]+$/);
      expect(decoded).toEqual(original);
    });

    it("should handle empty data", async () => {
      const empty = new Uint8Array(0);
      const hex = await toHex(empty);
      const decoded = await fromHex(hex);

      expect(hex).toBe("");
      expect(decoded).toEqual(empty);
    });

    it("should handle large data", async () => {
      const large = TEST_CONTENT_MEDIUM;
      const hex = await toHex(large);
      const decoded = await fromHex(hex);

      expect(hex.length).toBe(large.length * 2);
      expect(decoded).toEqual(large);
    });
  });
});

