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

