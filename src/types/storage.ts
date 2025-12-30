/**
 * Storage Interface for @zkim-platform/file-format
 * Abstract storage backend for different storage implementations
 */

/**
 * Storage backend interface
 * Implement this interface to provide custom storage backends
 */
export interface IStorageBackend {
  /**
   * Store data with the given key
   */
  set(key: string, value: Uint8Array): Promise<void>;

  /**
   * Retrieve data by key
   */
  get(key: string): Promise<Uint8Array | null>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete data by key
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all data
   */
  clear(): Promise<void>;

  /**
   * Get all keys
   */
  keys(): Promise<string[]>;
}

/**
 * In-memory storage implementation
 * Useful for testing or temporary storage
 */
export class InMemoryStorage implements IStorageBackend {
  private storage = new Map<string, Uint8Array>();

  public async set(key: string, value: Uint8Array): Promise<void> {
    this.storage.set(key, value);
  }

  public async get(key: string): Promise<Uint8Array | null> {
    return this.storage.get(key) || null;
  }

  public async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  public async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  public async clear(): Promise<void> {
    this.storage.clear();
  }

  public async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }
}

/**
 * LocalStorage-based storage implementation
 * For browser environments
 */
export class LocalStorageBackend implements IStorageBackend {
  private prefix: string;

  constructor(prefix = "zkim-file-format:") {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  public async set(key: string, value: Uint8Array): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("localStorage is not available");
    }
    const base64 = btoa(
      String.fromCharCode(...Array.from(value))
    );
    window.localStorage.setItem(this.getKey(key), base64);
  }

  public async get(key: string): Promise<Uint8Array | null> {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("localStorage is not available");
    }
    const base64 = window.localStorage.getItem(this.getKey(key));
    if (!base64) {
      return null;
    }
    const binary = atob(base64);
    return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
  }

  public async has(key: string): Promise<boolean> {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    return window.localStorage.getItem(this.getKey(key)) !== null;
  }

  public async delete(key: string): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.removeItem(this.getKey(key));
  }

  public async clear(): Promise<void> {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (key.startsWith(this.prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  }

  public async keys(): Promise<string[]> {
    if (typeof window === "undefined" || !window.localStorage) {
      return [];
    }
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }
}

