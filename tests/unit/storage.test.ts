/**
 * Storage Tests
 * Tests for storage interface implementations
 */

import { describe, it, expect } from "@jest/globals";
import { InMemoryStorage, LocalStorageBackend } from "../../src/types/storage";

describe("InMemoryStorage", () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe("set / get", () => {
    it("should store and retrieve data", async () => {
      const key = "test-key";
      const value = new Uint8Array([1, 2, 3, 4]);
      await storage.set(key, value);
      const retrieved = await storage.get(key);
      expect(retrieved).toEqual(value);
    });
  });

  describe("has", () => {
    it("should return true for existing key", async () => {
      const key = "test-key";
      const value = new Uint8Array([1, 2, 3]);
      await storage.set(key, value);
      expect(await storage.has(key)).toBe(true);
    });

    it("should return false for non-existent key", async () => {
      expect(await storage.has("non-existent")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete data", async () => {
      const key = "test-key";
      const value = new Uint8Array([1, 2, 3]);
      await storage.set(key, value);
      await storage.delete(key);
      expect(await storage.has(key)).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all data", async () => {
      await storage.set("key1", new Uint8Array([1]));
      await storage.set("key2", new Uint8Array([2]));
      await storage.clear();
      expect(await storage.has("key1")).toBe(false);
      expect(await storage.has("key2")).toBe(false);
    });
  });

  describe("keys", () => {
    it("should return all keys", async () => {
      await storage.set("key1", new Uint8Array([1]));
      await storage.set("key2", new Uint8Array([2]));
      const keys = await storage.keys();
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
    });
  });
});

describe("LocalStorageBackend", () => {
  // Note: LocalStorageBackend requires browser environment
  // These tests verify the interface but may not run in Node.js
  it("should be defined", () => {
    expect(LocalStorageBackend).toBeDefined();
  });
});

