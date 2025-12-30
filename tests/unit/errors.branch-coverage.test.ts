/**
 * Error Types Branch Coverage Tests
 * Targets specific branches to improve branch coverage metrics
 */

import { describe, it, expect } from "@jest/globals";
import {
  ServiceError,
  ZKIMFileError,
  ZKIMEncryptionError,
  ZKIMIntegrityError,
  ZKIMStorageError,
} from "../../src/types/errors";

describe("Error Types - Branch Coverage", () => {
  describe("ServiceError", () => {
    it("should create ServiceError with code and details", () => {
      const error = new ServiceError("Test error", {
        code: "TEST_ERROR",
        details: { key: "value" },
      });

      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ServiceError");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.details).toEqual({ key: "value" });
    });

    it("should create ServiceError without options", () => {
      const error = new ServiceError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ServiceError");
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it("should create ServiceError with only code", () => {
      const error = new ServiceError("Test error", {
        code: "TEST_ERROR",
      });

      expect(error.code).toBe("TEST_ERROR");
      expect(error.details).toBeUndefined();
    });

    it("should create ServiceError with only details", () => {
      const error = new ServiceError("Test error", {
        details: { key: "value" },
      });

      expect(error.code).toBeUndefined();
      expect(error.details).toEqual({ key: "value" });
    });
  });

  describe("ZKIMFileError - default code branch (line 64)", () => {
    it("should use default code when code is not provided (line 64)", () => {
      const error = new ZKIMFileError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ZKIMFileError");
      expect(error.code).toBe("ZKIM_FILE_ERROR"); // Default code
    });

    it("should use provided code when code is provided (line 64)", () => {
      const error = new ZKIMFileError("Test error", {
        code: "CUSTOM_ERROR",
      });

      expect(error.code).toBe("CUSTOM_ERROR");
    });

    it("should use default code when code is undefined (line 64)", () => {
      const error = new ZKIMFileError("Test error", {
        code: undefined,
      });

      expect(error.code).toBe("ZKIM_FILE_ERROR"); // Default code
    });
  });

  describe("ZKIMEncryptionError - default code branch (line 81)", () => {
    it("should use default code when code is not provided (line 81)", () => {
      const error = new ZKIMEncryptionError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ZKIMEncryptionError");
      expect(error.code).toBe("ZKIM_ENCRYPTION_ERROR"); // Default code
    });

    it("should use provided code when code is provided (line 81)", () => {
      const error = new ZKIMEncryptionError("Test error", {
        code: "CUSTOM_ENCRYPTION_ERROR",
      });

      expect(error.code).toBe("CUSTOM_ENCRYPTION_ERROR");
    });

    it("should use default code when code is undefined (line 81)", () => {
      const error = new ZKIMEncryptionError("Test error", {
        code: undefined,
      });

      expect(error.code).toBe("ZKIM_ENCRYPTION_ERROR"); // Default code
    });
  });

  describe("ZKIMIntegrityError - default code branch (line 98)", () => {
    it("should use default code when code is not provided (line 98)", () => {
      const error = new ZKIMIntegrityError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ZKIMIntegrityError");
      expect(error.code).toBe("ZKIM_INTEGRITY_ERROR"); // Default code
    });

    it("should use provided code when code is provided (line 98)", () => {
      const error = new ZKIMIntegrityError("Test error", {
        code: "CUSTOM_INTEGRITY_ERROR",
      });

      expect(error.code).toBe("CUSTOM_INTEGRITY_ERROR");
    });

    it("should use default code when code is undefined (line 98)", () => {
      const error = new ZKIMIntegrityError("Test error", {
        code: undefined,
      });

      expect(error.code).toBe("ZKIM_INTEGRITY_ERROR"); // Default code
    });
  });

  describe("ZKIMStorageError - default code branch (line 115)", () => {
    it("should use default code when code is not provided (line 115)", () => {
      const error = new ZKIMStorageError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.name).toBe("ZKIMStorageError");
      expect(error.code).toBe("ZKIM_STORAGE_ERROR"); // Default code
    });

    it("should use provided code when code is provided (line 115)", () => {
      const error = new ZKIMStorageError("Test error", {
        code: "CUSTOM_STORAGE_ERROR",
      });

      expect(error.code).toBe("CUSTOM_STORAGE_ERROR");
    });

    it("should use default code when code is undefined (line 115)", () => {
      const error = new ZKIMStorageError("Test error", {
        code: undefined,
      });

      expect(error.code).toBe("ZKIM_STORAGE_ERROR"); // Default code
    });
  });
});

