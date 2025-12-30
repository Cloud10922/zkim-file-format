/**
 * Test Data for ZKIM File Format Tests
 */

export const TEST_FILE_ID = "test-file-id-12345";
export const TEST_USER_ID = "test-user-id-67890";
export const TEST_PLATFORM_KEY_ID = "test-platform-key-id";

export const TEST_CONTENT_SMALL = new Uint8Array([
  0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57,
  0x6f, 0x72, 0x6c, 0x64, 0x21, // "Hello, World!"
]);

export const TEST_CONTENT_MEDIUM = new Uint8Array(
  Array.from({ length: 1024 }, (_, i) => i % 256)
);

export const TEST_CONTENT_LARGE = new Uint8Array(
  Array.from({ length: 10000 }, (_, i) => i % 256)
);

