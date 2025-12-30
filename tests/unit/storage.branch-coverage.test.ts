/**
 * Storage Types Branch Coverage Tests
 * Targets specific branches to improve branch coverage metrics
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  InMemoryStorage,
  LocalStorageBackend,
} from "../../src/types/storage";

describe("Storage Types - Branch Coverage", () => {
  describe("InMemoryStorage", () => {
    let storage: InMemoryStorage;

    beforeEach(() => {
      storage = new InMemoryStorage();
    });

    describe("get - null return branch (line 54)", () => {
      it("should return null when key does not exist (line 54)", async () => {
        const result = await storage.get("non-existent-key");

        expect(result).toBeNull();
      });

      it("should return value when key exists (line 54)", async () => {
        const value = new Uint8Array([1, 2, 3, 4, 5]);
        await storage.set("test-key", value);

        const result = await storage.get("test-key");

        expect(result).toEqual(value);
      });
    });

    describe("set, has, delete, clear, keys", () => {
      it("should set and get values", async () => {
        const value = new Uint8Array([1, 2, 3]);
        await storage.set("key1", value);

        const result = await storage.get("key1");
        expect(result).toEqual(value);
      });

      it("should check if key exists", async () => {
        expect(await storage.has("key1")).toBe(false);

        await storage.set("key1", new Uint8Array([1, 2, 3]));
        expect(await storage.has("key1")).toBe(true);
      });

      it("should delete keys", async () => {
        await storage.set("key1", new Uint8Array([1, 2, 3]));
        expect(await storage.has("key1")).toBe(true);

        await storage.delete("key1");
        expect(await storage.has("key1")).toBe(false);
      });

      it("should clear all keys", async () => {
        await storage.set("key1", new Uint8Array([1, 2, 3]));
        await storage.set("key2", new Uint8Array([4, 5, 6]));

        await storage.clear();

        expect(await storage.has("key1")).toBe(false);
        expect(await storage.has("key2")).toBe(false);
      });

      it("should return all keys", async () => {
        await storage.set("key1", new Uint8Array([1, 2, 3]));
        await storage.set("key2", new Uint8Array([4, 5, 6]));

        const keys = await storage.keys();

        expect(keys).toContain("key1");
        expect(keys).toContain("key2");
        expect(keys.length).toBe(2);
      });
    });
  });

  describe("LocalStorageBackend", () => {
    let storage: LocalStorageBackend;
    let mockGetItem: jest.Mock;
    let mockSetItem: jest.Mock;
    let mockRemoveItem: jest.Mock;
    let mockClear: jest.Mock;
    let mockKey: jest.Mock;

    beforeEach(() => {
      // Create jest mocks
      mockGetItem = jest.fn();
      mockSetItem = jest.fn();
      mockRemoveItem = jest.fn();
      mockClear = jest.fn();
      mockKey = jest.fn();

      // Mock localStorage for Node.js environment
      const mockLocalStorage = {
        getItem: mockGetItem,
        setItem: mockSetItem,
        removeItem: mockRemoveItem,
        clear: mockClear,
        key: mockKey,
        length: 0,
      };

      // Mock window.localStorage
      (global as any).window = {
        localStorage: mockLocalStorage as any,
      };

      storage = new LocalStorageBackend("test-prefix:");
    });

    afterEach(() => {
      jest.restoreAllMocks();
      delete (global as any).window;
    });

    describe("set - localStorage availability branches (line 90-92)", () => {
      it("should throw when localStorage is not available (line 90-92)", async () => {
        delete (global as any).window;

        await expect(
          storage.set("test-key", new Uint8Array([1, 2, 3]))
        ).rejects.toThrow("localStorage is not available");
      });

      it("should set value when localStorage is available (line 90-96)", async () => {
        const value = new Uint8Array([1, 2, 3]);
        await storage.set("test-key", value);

        expect(mockSetItem).toHaveBeenCalledWith(
          "test-prefix:test-key",
          expect.any(String)
        );
      });
    });

    describe("get - localStorage availability and null branches (line 100-109)", () => {
      it("should throw when localStorage is not available (line 100-102)", async () => {
        delete (global as any).window;

        await expect(storage.get("test-key")).rejects.toThrow(
          "localStorage is not available"
        );
      });

      it("should return null when key does not exist (line 104-106)", async () => {
        mockGetItem.mockReturnValue(null);

        const result = await storage.get("test-key");

        expect(result).toBeNull();
      });

      it("should return value when key exists (line 104-109)", async () => {
        const value = new Uint8Array([1, 2, 3]);
        const base64 = btoa(String.fromCharCode(...Array.from(value)));
        mockGetItem.mockReturnValue(base64);

        const result = await storage.get("test-key");

        expect(result).toEqual(value);
      });
    });

    describe("has - localStorage availability branches (line 112-116)", () => {
      it("should return false when localStorage is not available (line 112-114)", async () => {
        delete (global as any).window;

        const result = await storage.has("test-key");

        expect(result).toBe(false);
      });

      it("should return true when key exists (line 112-116)", async () => {
        mockGetItem.mockReturnValue("base64-value");

        const result = await storage.has("test-key");

        expect(result).toBe(true);
      });

      it("should return false when key does not exist (line 112-116)", async () => {
        mockGetItem.mockReturnValue(null);

        const result = await storage.has("test-key");

        expect(result).toBe(false);
      });
    });

    describe("delete - localStorage availability branches (line 119-123)", () => {
      it("should return silently when localStorage is not available (line 119-121)", async () => {
        delete (global as any).window;

        await expect(storage.delete("test-key")).resolves.toBeUndefined();
      });

      it("should delete key when localStorage is available (line 119-123)", async () => {
        await storage.delete("test-key");

        expect(mockRemoveItem).toHaveBeenCalledWith(
          "test-prefix:test-key"
        );
      });
    });

    describe("clear - localStorage availability and prefix branches (line 126-135)", () => {
      it("should return silently when localStorage is not available (line 126-128)", async () => {
        delete (global as any).window;

        await expect(storage.clear()).resolves.toBeUndefined();
      });

      it("should clear keys with prefix when localStorage is available (line 126-135)", async () => {
        // Set up localStorage with keys
        (global as any).window.localStorage.getItem = jest.fn();
        (global as any).window.localStorage.setItem = jest.fn();
        (global as any).window.localStorage.removeItem = mockRemoveItem;
        (global as any).window.localStorage.clear = jest.fn();
        (global as any).window.localStorage.key = jest.fn();
        
        // Mock Object.keys to return keys with and without prefix
        const originalKeys = Object.keys;
        const keysSpy = jest.spyOn(Object, "keys").mockImplementation((obj) => {
          if (obj === (global as any).window.localStorage) {
            return ["test-prefix:key1", "test-prefix:key2", "other-prefix:key3"];
          }
          return originalKeys(obj);
        });

        await storage.clear();

        // Verify removeItem was called for keys with prefix
        expect(mockRemoveItem).toHaveBeenCalledTimes(2);
        expect(mockRemoveItem).toHaveBeenCalledWith("test-prefix:key1");
        expect(mockRemoveItem).toHaveBeenCalledWith("test-prefix:key2");

        keysSpy.mockRestore();
      });

      it("should skip keys without prefix (line 131-133)", async () => {
        // Mock Object.keys to return keys without prefix
        const originalKeys = Object.keys;
        const keysSpy = jest.spyOn(Object, "keys").mockImplementation((obj) => {
          if (obj === (global as any).window.localStorage) {
            return ["other-prefix:key1"];
          }
          return originalKeys(obj);
        });

        await storage.clear();

        // Verify removeItem was not called for keys without prefix
        expect(mockRemoveItem).not.toHaveBeenCalled();

        keysSpy.mockRestore();
      });
    });

    describe("keys - localStorage availability and prefix branches (line 138-149)", () => {
      it("should return empty array when localStorage is not available (line 138-140)", async () => {
        delete (global as any).window;

        const result = await storage.keys();

        expect(result).toEqual([]);
      });

      it("should return only keys with prefix (line 138-149)", async () => {
        // Update window.localStorage.length
        Object.defineProperty((global as any).window.localStorage, "length", {
          value: 3,
          writable: true,
          configurable: true,
        });

        mockKey
          .mockReturnValueOnce("test-prefix:key1")
          .mockReturnValueOnce("test-prefix:key2")
          .mockReturnValueOnce("other-prefix:key3");

        const result = await storage.keys();

        expect(result).toContain("key1");
        expect(result).toContain("key2");
        expect(result).not.toContain("key3");
        expect(result.length).toBe(2);
      });

      it("should skip null keys (line 144-146)", async () => {
        // Update window.localStorage.length
        Object.defineProperty((global as any).window.localStorage, "length", {
          value: 2,
          writable: true,
          configurable: true,
        });

        mockKey
          .mockReturnValueOnce("test-prefix:key1")
          .mockReturnValueOnce(null);

        const result = await storage.keys();

        expect(result).toEqual(["key1"]);
      });

      it("should skip keys without prefix (line 144-146)", async () => {
        // Update window.localStorage.length
        Object.defineProperty((global as any).window.localStorage, "length", {
          value: 2,
          writable: true,
          configurable: true,
        });

        mockKey
          .mockReturnValueOnce("test-prefix:key1")
          .mockReturnValueOnce("other-prefix:key2");

        const result = await storage.keys();

        expect(result).toEqual(["key1"]);
      });
    });
  });
});

