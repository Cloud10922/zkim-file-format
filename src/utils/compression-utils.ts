/**
 * ZKIM Compression Utilities
 * 
 * Abstraction layer for compression operations
 * Uses pako for browser compatibility, with Node.js zlib fallback for Node.js environments
 * 
 * Note: Node.js zlib is only used as a fallback in Node.js runtime environments (e.g., Jest tests).
 * In browser environments, pako is used exclusively. The dynamic import of zlib will fail
 * gracefully in browsers and fall back to pako.
 */

import { ErrorUtils } from "./error-handling";
import { ServiceError } from "../types/errors";
import type { ILogger } from "./logger";
import { defaultLogger } from "./logger";

// Compression level constants
const COMPRESSION_LEVEL_MIN = 0;
const COMPRESSION_LEVEL_MAX = 9;
const COMPRESSION_LEVEL_DEFAULT = 6;

/**
 * Check if running in browser environment
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

/**
 * Try to use Node.js zlib for compression (works in Node.js runtime environments)
 * Returns null if not available (browser environment)
 * 
 * Note: This function uses dynamic import to avoid bundling zlib in browser builds.
 * The import will fail in browser environments and gracefully fall back to pako.
 */
async function tryNodeZlibCompress(
  data: Uint8Array,
  level: number,
  logger: ILogger
): Promise<Uint8Array | null> {
  const context = ErrorUtils.createContext(
    "CompressionUtils",
    "tryNodeZlibCompress",
    {
      severity: "low",
      timestamp: new Date().toISOString(),
    }
  );

  const result = await ErrorUtils.withErrorHandling(async () => {
    // Dynamic import of zlib - only works in Node.js runtime
    // This will fail in browser environments and is caught below
    // Dynamic import with fallback for Node.js runtime only
    const zlib = await import("zlib");
    if (zlib && typeof zlib.gzipSync === "function") {
      // Buffer is available in Node.js runtime when zlib is available
      const buffer = Buffer.from(data);
      const compressed = zlib.gzipSync(buffer, { level });
      return new Uint8Array(compressed);
    }
    return null;
  }, context);

  if (!result.success) {
    // zlib not available (browser environment) - this is expected and handled gracefully
    // Log at debug level to avoid noise in production logs
    logger.debug("Node.js zlib not available, will use pako fallback", {
      environment: isBrowser() ? "browser" : "unknown",
      error: result.error,
    });
    return null;
  }

  return result.data ?? null;
}

/**
 * Try to use Node.js zlib for decompression (works in Node.js runtime environments)
 * Returns null if not available (browser environment)
 * 
 * Note: This function uses dynamic import to avoid bundling zlib in browser builds.
 * The import will fail in browser environments and gracefully fall back to pako.
 */
async function tryNodeZlibDecompress(
  data: Uint8Array,
  logger: ILogger
): Promise<Uint8Array | null> {
  const context = ErrorUtils.createContext(
    "CompressionUtils",
    "tryNodeZlibDecompress",
    {
      severity: "low",
      timestamp: new Date().toISOString(),
    }
  );

  const result = await ErrorUtils.withErrorHandling(async () => {
    // Dynamic import of zlib - only works in Node.js runtime
    // This will fail in browser environments and is caught below
    // Dynamic import with fallback for Node.js runtime only
    const zlib = await import("zlib");
    if (zlib && typeof zlib.gunzipSync === "function") {
      // Buffer is available in Node.js runtime when zlib is available
      const buffer = Buffer.from(data);
      const decompressed = zlib.gunzipSync(buffer);
      return new Uint8Array(decompressed);
    }
    return null;
  }, context);

  if (!result.success) {
    // zlib not available (browser environment) - this is expected and handled gracefully
    // Log at debug level to avoid noise in production logs
    logger.debug("Node.js zlib not available, will use pako fallback", {
      environment: isBrowser() ? "browser" : "unknown",
      error: result.error,
    });
    return null;
  }

  return result.data ?? null;
}

/**
 * Compress data using GZIP algorithm
 * Uses pako for browser compatibility, with Node.js zlib fallback
 */
export async function compressGzip(
  data: Uint8Array,
  level: number = COMPRESSION_LEVEL_DEFAULT,
  logger: ILogger = defaultLogger
): Promise<Uint8Array> {
  const context = ErrorUtils.createContext(
    "CompressionUtils",
    "compressGzip",
    {
      severity: "high",
      timestamp: new Date().toISOString(),
    }
  );

  const result = await ErrorUtils.withErrorHandling(async () => {
    // Clamp level to valid range (0-9)
    const clampedLevel = Math.max(
      COMPRESSION_LEVEL_MIN,
      Math.min(COMPRESSION_LEVEL_MAX, level)
    );

    // Try Node.js zlib first (for Node.js runtime environment)
    const nodeResult = await tryNodeZlibCompress(data, clampedLevel, logger);
    if (nodeResult) {
      return nodeResult;
    }

    // Fall back to pako for browser environment
    let pakoModule: unknown;
    try {
      pakoModule = await import("pako");
    } catch (importError) {
      throw new ServiceError("pako compression library import failed", {
        code: "COMPRESSION_LIBRARY_UNAVAILABLE",
        details: { 
          importError: importError instanceof Error ? importError.message : String(importError) 
        },
      });
    }
    
    // pako can be exported as default or named export
    const pako = (pakoModule as { default?: unknown })?.default ?? pakoModule;
    
    if (!pako || typeof pako !== "object") {
      throw new ServiceError("pako compression library not available (module is null/undefined)", {
        code: "COMPRESSION_LIBRARY_UNAVAILABLE",
      });
    }
    
    const pakoObj = pako as { gzip?: unknown };
    const gzipFn = pakoObj?.gzip;
    if (!gzipFn || typeof gzipFn !== "function") {
      throw new ServiceError("pako compression library not available (gzip method missing or invalid)", {
        code: "COMPRESSION_LIBRARY_UNAVAILABLE",
      });
    }
    
    return (gzipFn as (data: Uint8Array, options?: { level?: number }) => Uint8Array)(data, { level: clampedLevel });
  }, context);

  if (!result.success) {
    throw new ServiceError(`Gzip compression failed: ${String(result.error)}`, {
      code: "GZIP_COMPRESSION_FAILED",
      details: { error: result.error },
    });
  }

  if (!result.data) {
    throw new ServiceError("Compression result data is undefined", {
      code: "COMPRESSION_DATA_MISSING",
    });
  }

  return result.data;
}

/**
 * Decompress data using GZIP algorithm
 * Uses pako for browser compatibility, with Node.js zlib fallback
 */
export async function decompressGzip(
  data: Uint8Array,
  originalSize?: number,
  logger: ILogger = defaultLogger
): Promise<Uint8Array> {
  const context = ErrorUtils.createContext(
    "CompressionUtils",
    "decompressGzip",
    {
      severity: "high",
      timestamp: new Date().toISOString(),
    }
  );

  const result = await ErrorUtils.withErrorHandling(async () => {
    // Try Node.js zlib first (for Node.js runtime environment)
    const nodeResult = await tryNodeZlibDecompress(data, logger);
    if (nodeResult) {
      if (originalSize !== undefined && nodeResult.length !== originalSize) {
        logger.warn("Decompressed size mismatch", {
          expected: originalSize,
          actual: nodeResult.length,
        });
      }
      return nodeResult;
    }

    // Fall back to pako for browser environment
    let pakoModule: unknown;
    try {
      pakoModule = await import("pako");
    } catch (importError) {
      throw new ServiceError("pako compression library import failed", {
        code: "COMPRESSION_LIBRARY_UNAVAILABLE",
        details: { 
          importError: importError instanceof Error ? importError.message : String(importError) 
        },
      });
    }
    
    const pako = (pakoModule as { default?: unknown })?.default ?? pakoModule;
    
    if (!pako || typeof pako !== "object") {
      throw new ServiceError("pako compression library not available (module is null/undefined)", {
        code: "COMPRESSION_LIBRARY_UNAVAILABLE",
      });
    }
    
    const pakoObj = pako as { ungzip?: unknown };
    const ungzipFn = pakoObj?.ungzip;
    if (!ungzipFn || typeof ungzipFn !== "function") {
      throw new ServiceError("pako compression library not available (ungzip method missing or invalid)", {
        code: "COMPRESSION_LIBRARY_UNAVAILABLE",
      });
    }
    
    const decompressed = (ungzipFn as (data: Uint8Array) => Uint8Array)(data);

    if (originalSize !== undefined && decompressed.length !== originalSize) {
      logger.warn("Decompressed size mismatch", {
        expected: originalSize,
        actual: decompressed.length,
      });
    }

    return decompressed;
  }, context);

  if (!result.success) {
    throw new ServiceError(`Gzip decompression failed: ${String(result.error)}`, {
      code: "GZIP_DECOMPRESSION_FAILED",
      details: { error: result.error },
    });
  }

  if (!result.data) {
    throw new ServiceError("Decompression result data is undefined", {
      code: "DECOMPRESSION_DATA_MISSING",
    });
  }

  return result.data;
}

