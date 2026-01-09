/**
 * Jest Test Setup
 * Global test configuration and mocks
 * 
 * CRITICAL: Set NODE_ENV to test BEFORE any modules are loaded
 * This prevents services from creating real timers
 */

// Setup global sodium mock for libsodium-wrappers-sumo
// libsodium-wrappers-sumo uses IIFE: (function(e) { ... })(this)
// The library checks for `e.sodium` where `e` is `this` (the global object)
// In strict mode, `this` is undefined, so we need to set it on the global object
// This must be set BEFORE Jest loads any modules

interface GlobalSodium {
  sodium?: {
    ready: Promise<void>;
    onload: null;
  };
}

const sodiumMock = { ready: Promise.resolve(), onload: null };

if (typeof globalThis !== "undefined") {
  (globalThis as unknown as GlobalSodium).sodium = sodiumMock;
}
if (typeof global !== "undefined") {
  (global as unknown as GlobalSodium).sodium = sodiumMock;
}

// Also set up a getter on globalThis to ensure it's always available
Object.defineProperty(globalThis, "sodium", {
  value: sodiumMock,
  writable: true,
  configurable: true,
  enumerable: true,
});

// CRITICAL: Set NODE_ENV to test to prevent services from starting real timers
// This must be done BEFORE any modules are loaded
if (typeof process !== "undefined") {
  // Set NODE_ENV first
  process.env.NODE_ENV = "test";
  
  // Lock NODE_ENV to prevent it from being changed
  // This ensures test detection always works
  try {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "test",
      writable: false,
      configurable: false,
    });
  } catch {
    // If defineProperty fails, at least set it
    process.env.NODE_ENV = "test";
  }
  
  // Set global test flag for additional detection method
  if (typeof globalThis !== "undefined") {
    (globalThis as { __TEST__?: boolean }).__TEST__ = true;
  }
}

// Note: Individual tests must use jest.useFakeTimers() in beforeEach
// Global fake timers in setup.ts can cause issues with async operations
// Each test file should handle its own timer setup/teardown

