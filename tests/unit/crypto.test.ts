/**
 * Crypto Utilities Tests
 * Tests for crypto utility functions (no timers, simplest tests)
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import sodium from "libsodium-wrappers-sumo";
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

    it("should generate different random bytes each time", async () => {
      const bytes1 = await generateRandomBytes(32);
      const bytes2 = await generateRandomBytes(32);
      expect(bytes1).not.toEqual(bytes2);
    });
  });

  describe("generateRandomHex", () => {
    it("should generate random hex string of specified length", async () => {
      const hex = await generateRandomHex(32);
      expect(typeof hex).toBe("string");
      expect(hex.length).toBe(32);
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });
  });

  describe("hashData", () => {
    it("should hash data using BLAKE3", () => {
      const data = new TextEncoder().encode("test data");
      const hash = hashData(data);
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32); // Default output length
    });

    it("should hash data with custom output length", () => {
      const data = new TextEncoder().encode("test data");
      const hash = hashData(data, 64);
      expect(hash.length).toBe(64);
    });

    it("should produce same hash for same input", () => {
      const data = new TextEncoder().encode("test data");
      const hash1 = hashData(data);
      const hash2 = hashData(data);
      expect(hash1).toEqual(hash2);
    });
  });

  describe("hashDataToHex", () => {
    it("should hash data and return hex string", () => {
      const data = new TextEncoder().encode("test data");
      const hex = hashDataToHex(data);
      expect(typeof hex).toBe("string");
      expect(hex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });
  });

  describe("generateKeyPair", () => {
    it("should generate X25519 key pair", async () => {
      const keyPair = await generateKeyPair();
      expect(keyPair).toHaveProperty("publicKey");
      expect(keyPair).toHaveProperty("privateKey");
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });
  });

  describe("generateSigningKeyPair", () => {
    it("should generate ML-DSA-65 signing key pair", async () => {
      const keyPair = await generateSigningKeyPair();
      expect(keyPair).toHaveProperty("publicKey");
      expect(keyPair).toHaveProperty("privateKey");
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      // ML-DSA-65 keys: public key 1952 bytes, secret key 4032 bytes
      expect(keyPair.publicKey.length).toBe(1952);
      expect(keyPair.privateKey.length).toBe(4032);
    });
  });

  describe("encryptData / decryptData", () => {
    it("should encrypt and decrypt data", async () => {
      const data = new TextEncoder().encode("test message");
      const key = await generateRandomBytes(32);
      const nonce = await generateRandomBytes(24);

      const encrypted = await encryptData(data, key, nonce);
      // encryptData returns { ciphertext, nonce } object
      expect(encrypted).toHaveProperty("ciphertext");
      expect(encrypted).toHaveProperty("nonce");
      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce).toBeInstanceOf(Uint8Array);
      expect(encrypted.ciphertext.length).toBeGreaterThan(data.length);

      const decrypted = await decryptData(encrypted.ciphertext, key, encrypted.nonce);
      expect(decrypted).toEqual(data);
    });

    it("should fail to decrypt with wrong key", async () => {
      const data = new TextEncoder().encode("test message");
      const key = await generateRandomBytes(32);
      const wrongKey = await generateRandomBytes(32);
      const nonce = await generateRandomBytes(24);

      const encrypted = await encryptData(data, key, nonce);
      
      await expect(decryptData(encrypted.ciphertext, wrongKey, encrypted.nonce)).rejects.toThrow();
    });
  });

  describe("toBase64 / fromBase64", () => {
    it("should encode and decode base64", async () => {
      const data = new TextEncoder().encode("test data");
      const encoded = await toBase64(data);
      expect(typeof encoded).toBe("string");
      
      const decoded = await fromBase64(encoded);
      expect(decoded).toEqual(data);
    });
  });

  describe("toHex / fromHex", () => {
    it("should encode and decode hex", async () => {
      const data = new TextEncoder().encode("test data");
      const encoded = await toHex(data);
      expect(typeof encoded).toBe("string");
      expect(/^[0-9a-f]+$/.test(encoded)).toBe(true);
      
      const decoded = await fromHex(encoded);
      expect(decoded).toEqual(data);
    });
  });
});
