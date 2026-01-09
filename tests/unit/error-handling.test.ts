/**
 * Error Handling Tests
 * Tests for error handling utilities
 */

import { describe, it, expect } from "@jest/globals";
import { ErrorUtils } from "../../src/utils/error-handling";
import { ServiceError } from "../../src/types/errors";
import { defaultLogger } from "../../src/utils/logger";

describe("ErrorUtils", () => {
  describe("createContext", () => {
    it("should create error context", () => {
      const context = ErrorUtils.createContext("TestService", "testOperation");
      expect(context).toHaveProperty("message");
      expect(context).toHaveProperty("source");
      expect(context).toHaveProperty("operation");
      expect(context).toHaveProperty("timestamp");
      expect(context).toHaveProperty("type");
      expect(context).toHaveProperty("severity");
      expect(context.source).toBe("TestService");
      expect(context.operation).toBe("testOperation");
    });

    it("should create context with additional data", () => {
      const context = ErrorUtils.createContext("TestService", "testOperation", {
        severity: "high",
        userId: "test-user",
      });
      expect(context.severity).toBe("high");
      expect(context.userId).toBe("test-user");
    });

    it("should throw error for invalid service name", () => {
      expect(() => {
        ErrorUtils.createContext("", "testOperation");
      }).toThrow(ServiceError);
    });

    it("should throw error for invalid operation name", () => {
      expect(() => {
        ErrorUtils.createContext("TestService", "");
      }).toThrow(ServiceError);
    });

    it("should throw error for invalid severity", () => {
      expect(() => {
        ErrorUtils.createContext("TestService", "testOperation", {
          severity: "invalid" as "low",
        });
      }).toThrow(ServiceError);
    });
  });

  describe("getErrorMessage", () => {
    it("should extract message from Error", () => {
      const error = new Error("test error");
      expect(ErrorUtils.getErrorMessage(error)).toBe("test error");
    });

    it("should extract message from object with message property", () => {
      const error = { message: "test message" };
      expect(ErrorUtils.getErrorMessage(error)).toBe("test message");
    });

    it("should convert non-Error to string", () => {
      expect(ErrorUtils.getErrorMessage("string error")).toBe("string error");
      expect(ErrorUtils.getErrorMessage(123)).toBe("123");
    });
  });

  describe("createSuccessResult", () => {
    it("should create success result", () => {
      const result = ErrorUtils.createSuccessResult({ data: "test" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: "test" });
    });
  });

  describe("createErrorResult", () => {
    it("should create error result", () => {
      const result = ErrorUtils.createErrorResult("test error");
      expect(result.success).toBe(false);
      expect(result.error).toBe("test error");
    });
  });

  describe("withErrorHandling", () => {
    it("should return success result for successful operation", async () => {
      const result = await ErrorUtils.withErrorHandling(async () => {
        return "test data";
      }, ErrorUtils.createContext("TestService", "testOperation"));

      expect(result.success).toBe(true);
      expect(result.data).toBe("test data");
    });

    it("should return error result for failed operation", async () => {
      const result = await ErrorUtils.withErrorHandling(async () => {
        throw new Error("test error");
      }, ErrorUtils.createContext("TestService", "testOperation"));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("setLogger", () => {
    it("should set custom logger", () => {
      const customLogger = defaultLogger;
      ErrorUtils.setLogger(customLogger);
      // Should not throw
      expect(true).toBe(true);
    });
  });
});

