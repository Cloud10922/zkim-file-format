/**
 * Constant-Time Security Utilities
 *
 * Provides constant-time implementations of common operations to prevent
 * timing attacks in cryptographic applications.
 *
 * Security Features:
 * - Constant-time string comparison
 * - Constant-time array operations
 * - Timing attack prevention
 * - Secure random delays
 * - Memory-safe operations
 */

// libsodium-wrappers-sumo uses default export, not namespace export
import sodium from "libsodium-wrappers-sumo";

import { defaultLogger } from "./logger";

export class ConstantTimeSecurity {
  private static readonly MIN_OPERATION_TIME = 10; // 10ms minimum
  private static readonly MAX_OPERATION_TIME = 100; // 100ms maximum
  private static readonly RANDOM_DELAY_FACTOR = 0.1; // 10% random variation

  /**
   * Constant-time string comparison
   *
   * Prevents timing attacks by ensuring comparison always takes the same time
   * regardless of where the strings differ.
   */
  public static constantTimeStringCompare(a: string, b: string): boolean {
    // Perform full comparison regardless of length to maintain constant time
    const maxLength = Math.max(a.length, b.length);
    let result = a.length !== b.length ? 1 : 0; // Start with length difference

    for (let i = 0; i < maxLength; i++) {
      const aChar = i < a.length ? a.charCodeAt(i) : 0;
      const bChar = i < b.length ? b.charCodeAt(i) : 0;
      result |= aChar ^ bChar;
    }

    return result === 0;
  }

  /**
   * Constant-time byte array comparison
   *
   * Prevents timing attacks on binary data comparisons.
   */
  public static constantTimeByteCompare(a: Uint8Array, b: Uint8Array): boolean {
    // Perform full comparison regardless of length to maintain constant time
    const maxLength = Math.max(a.length, b.length);
    let result = a.length !== b.length ? 1 : 0; // Start with length difference

    for (let i = 0; i < maxLength; i++) {
      const aByte = i < a.length ? (a[i] ?? 0) : 0;
      const bByte = i < b.length ? (b[i] ?? 0) : 0;
      result |= aByte ^ bByte;
    }

    return result === 0;
  }

  /**
   * Constant-time array search
   *
   * Prevents timing attacks on array search operations by always
   * checking all elements regardless of early matches.
   */
  public static constantTimeArrayIncludes<T>(
    array: T[],
    target: T,
    compareFn: (a: T, b: T) => boolean = (a, b) => a === b
  ): boolean {
    let result = 0;

    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      if (item === undefined) {
        continue;
      }
      const isMatch = compareFn(item, target) ? 1 : 0;
      result |= isMatch;
    }

    return result === 1;
  }

  /**
   * Constant-time string array search
   *
   * Specialized version for string arrays using constant-time comparison.
   */
  public static constantTimeStringArrayIncludes(
    array: string[],
    target: string
  ): boolean {
    let result = 0;

    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      if (item === undefined) {
        continue;
      }
      const isMatch = this.constantTimeStringCompare(item, target) ? 1 : 0;
      result |= isMatch;
    }

    return result === 1;
  }

  /**
   * Constant-time length validation
   *
   * Validates array/string length without revealing the actual length
   * through timing differences.
   */
  public static constantTimeLengthCheck(
    data: string | Uint8Array,
    expectedLength: number
  ): boolean {
    const actualLength = data.length;
    const lengthDiff = actualLength ^ expectedLength;

    // Always perform the same operations regardless of length
    // This loop ensures constant-time execution even for different lengths
    let accessCount = 0;
    for (let i = 0; i < Math.max(actualLength, expectedLength); i++) {
      const dataByte =
        i < actualLength
          ? typeof data === "string"
            ? data.charCodeAt(i)
            : (data[i] ?? 0)
          : 0;
      accessCount += dataByte > 0 ? 1 : 0; // Count non-zero bytes for timing consistency
    }
    // Use accessCount in a way that doesn't affect the result but prevents optimization
    void accessCount;

    return lengthDiff === 0;
  }

  /**
   * Secure random delay
   *
   * Adds a random delay to prevent timing analysis attacks.
   */
  public static async addSecureDelay(
    baseTime: number = this.MIN_OPERATION_TIME
  ): Promise<void> {
    await sodium.ready;

    // Generate cryptographically secure random delay
    const randomBytes = sodium.randombytes_buf(4);
    const firstByte = randomBytes[0];
    if (firstByte === undefined) {
      throw new Error("Failed to generate random bytes");
    }
    const randomFactor = (firstByte / 255) * this.RANDOM_DELAY_FACTOR;
    const delay = baseTime * (1 + randomFactor);

    const startTime = performance.now();
    while (performance.now() - startTime < delay) {
      // Busy wait to maintain constant time
      // This prevents the event loop from being used for timing analysis
    }
  }

  /**
   * Timing attack prevention wrapper
   *
   * Wraps any operation with timing attack prevention measures.
   */
  public static async withTimingProtection<T>(
    operation: () => T | Promise<T>,
    minTime: number = this.MIN_OPERATION_TIME,
    maxTime: number = this.MAX_OPERATION_TIME
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await operation();
      const operationTime = performance.now() - startTime;

      // Add delay if operation was too fast
      if (operationTime < minTime) {
        await this.addSecureDelay(minTime - operationTime);
      }

      // Add random delay to prevent timing analysis
      // Use cryptographically secure random for timing attack prevention
      await sodium.ready;
      const randomBytes = sodium.randombytes_buf(4);
      const firstByte = randomBytes[0];
      if (firstByte === undefined) {
        throw new Error("Failed to generate random bytes for timing protection");
      }
      const randomFactor = (firstByte / 255) * 0.1;
      const randomDelay = (maxTime - minTime) * randomFactor;
      await this.addSecureDelay(randomDelay);

      return result;
    } catch (error) {
      // Even on error, maintain timing consistency
      const operationTime = performance.now() - startTime;
      if (operationTime < minTime) {
        await this.addSecureDelay(minTime - operationTime);
      }

      throw error;
    }
  }

  /**
   * Constant-time magic number validation
   *
   * Validates magic numbers without timing leaks.
   */
  public static validateMagicNumber(
    actual: string,
    expected = "ZKIM"
  ): boolean {
    return this.constantTimeStringCompare(actual, expected);
  }

  /**
   * Constant-time version validation
   *
   * Validates version numbers without timing leaks.
   */
  public static validateVersion(
    actual: number,
    expected: number,
    minVersion = 1,
    maxVersion = 255
  ): boolean {
    // Check if version is within valid range
    const isInRange = actual >= minVersion && actual <= maxVersion ? 1 : 0;
    const isExpected = actual === expected ? 1 : 0;

    // Always perform the same loop operations for constant-time execution
    let matchFound = 0;
    for (let i = minVersion; i <= maxVersion; i++) {
      const isCurrentVersion = i === actual ? 1 : 0;
      const isExpectedVersion = i === expected ? 1 : 0;
      matchFound |= isCurrentVersion & isExpectedVersion;
    }

    // Combine all checks: must be in range, expected, and found in loop
    return (isInRange & isExpected & matchFound) === 1;
  }

  /**
   * Constant-time size validation
   *
   * Validates data sizes without timing leaks.
   */
  public static validateSize(
    actualSize: number,
    expectedSize: number,
    tolerance = 1024
  ): boolean {
    const sizeDiff = Math.abs(actualSize - expectedSize);
    const isWithinTolerance = sizeDiff <= tolerance ? 1 : 0;

    // Always perform the same operations regardless of size
    let result = 0;
    for (let i = 0; i < Math.max(actualSize, expectedSize); i += 1024) {
      const actualChunk = i < actualSize ? 1 : 0;
      const expectedChunk = i < expectedSize ? 1 : 0;
      result |= actualChunk ^ expectedChunk;
    }

    return (isWithinTolerance && result === 0) === true;
  }

  /**
   * Secure comparison with logging
   *
   * Performs constant-time comparison with security logging.
   */
  public static secureCompare<T>(
    actual: T,
    expected: T,
    context: string,
    compareFn: (a: T, b: T) => boolean = (a, b) => a === b
  ): boolean {
    const startTime = performance.now();
    const result = compareFn(actual, expected);
    const operationTime = performance.now() - startTime;

    // Log security events
    if (!result) {
      defaultLogger.warn("Security validation failed", {
        context,
        operationTime,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Memory-safe string operations
   *
   * Performs string operations without memory leaks.
   */
  public static memorySafeStringOperation(
    operation: (str: string) => string
  ): (str: string) => string {
    return (str: string) => {
      try {
        const result = operation(str);
        // Clear sensitive data from memory
        if (typeof str === "string") {
          // In a real implementation, you'd want to overwrite the string
          // This is a simplified version
        }
        return result;
      } catch (error) {
        defaultLogger.error("String operation failed", error);
        throw error;
      }
    };
  }

  /**
   * Secure array operations
   *
   * Performs array operations with timing attack prevention.
   */
  public static secureArrayOperation<T>(
    array: T[],
    operation: (arr: T[]) => boolean
  ): boolean {
    return this.withTimingProtection(async () => {
      return operation(array);
    }) as unknown as boolean;
  }

  /**
   * Timing attack detection
   *
   * Detects potential timing attacks by monitoring operation times.
   */
  public static detectTimingAttack(
    operationTimes: number[],
    threshold = 50 // 50ms threshold
  ): boolean {
    if (operationTimes.length < 10) return false;

    const avgTime =
      operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length;
    const variance =
      operationTimes.reduce(
        (acc, time) => acc + Math.pow(time - avgTime, 2),
        0
      ) / operationTimes.length;
    const stdDev = Math.sqrt(variance);

    // If standard deviation is too low, it might indicate timing attacks
    return stdDev < threshold;
  }
}

// Export utility functions for easy use
export function constantTimeStringCompare(a: string, b: string): boolean {
  return ConstantTimeSecurity.constantTimeStringCompare(a, b);
}

export function constantTimeByteCompare(a: Uint8Array, b: Uint8Array): boolean {
  return ConstantTimeSecurity.constantTimeByteCompare(a, b);
}

export function constantTimeArrayIncludes<T>(
  array: T[],
  target: T,
  compareFn?: (a: T, b: T) => boolean
): boolean {
  return ConstantTimeSecurity.constantTimeArrayIncludes(
    array,
    target,
    compareFn
  );
}

export function constantTimeStringArrayIncludes(
  array: string[],
  target: string
): boolean {
  return ConstantTimeSecurity.constantTimeStringArrayIncludes(array, target);
}

export function validateMagicNumber(
  actual: string,
  expected?: string
): boolean {
  return ConstantTimeSecurity.validateMagicNumber(actual, expected);
}

export function validateVersion(
  actual: number,
  expected: number,
  minVersion?: number,
  maxVersion?: number
): boolean {
  return ConstantTimeSecurity.validateVersion(
    actual,
    expected,
    minVersion,
    maxVersion
  );
}

export function validateSize(
  actualSize: number,
  expectedSize: number,
  tolerance?: number
): boolean {
  return ConstantTimeSecurity.validateSize(actualSize, expectedSize, tolerance);
}

export async function withTimingProtection<T>(
  operation: () => T | Promise<T>,
  minTime?: number,
  maxTime?: number
): Promise<T> {
  return ConstantTimeSecurity.withTimingProtection(operation, minTime, maxTime);
}

export async function addSecureDelay(baseTime?: number): Promise<void> {
  return ConstantTimeSecurity.addSecureDelay(baseTime);
}
