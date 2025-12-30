/**
 * Error Handling Branch Coverage Tests
 * Targets specific branches to improve branch coverage metrics
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ErrorUtils } from "../../src/utils/error-handling";
import { ServiceError } from "../../src/types/errors";
import type { ILogger } from "../../src/utils/logger";

describe("ErrorUtils - Branch Coverage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe("createContext - validation branches", () => {
    it("should throw when service is empty string (line 32-37)", () => {
      expect(() => {
        ErrorUtils.createContext("", "operation");
      }).toThrow(ServiceError);
      expect(() => {
        ErrorUtils.createContext("", "operation");
      }).toThrow("Service name is required");
    });

    it("should throw when service is not a string (line 32-37)", () => {
      expect(() => {
        ErrorUtils.createContext(null as any, "operation");
      }).toThrow(ServiceError);
      expect(() => {
        ErrorUtils.createContext(123 as any, "operation");
      }).toThrow(ServiceError);
    });

    it("should throw when operation is empty string (line 39-47)", () => {
      expect(() => {
        ErrorUtils.createContext("service", "");
      }).toThrow(ServiceError);
      expect(() => {
        ErrorUtils.createContext("service", "");
      }).toThrow("Operation name is required");
    });

    it("should throw when operation is not a string (line 39-47)", () => {
      expect(() => {
        ErrorUtils.createContext("service", null as any);
      }).toThrow(ServiceError);
      expect(() => {
        ErrorUtils.createContext("service", 123 as any);
      }).toThrow(ServiceError);
    });

    it("should throw when severity is invalid (line 60-75)", () => {
      expect(() => {
        ErrorUtils.createContext("service", "operation", {
          severity: "invalid" as any,
        });
      }).toThrow(ServiceError);
      expect(() => {
        ErrorUtils.createContext("service", "operation", {
          severity: "invalid" as any,
        });
      }).toThrow("Invalid severity level");
    });

    it("should accept valid severity levels (line 60-75)", () => {
      const context1 = ErrorUtils.createContext("service", "operation", {
        severity: "low",
      });
      expect(context1.severity).toBe("low");

      const context2 = ErrorUtils.createContext("service", "operation", {
        severity: "medium",
      });
      expect(context2.severity).toBe("medium");

      const context3 = ErrorUtils.createContext("service", "operation", {
        severity: "high",
      });
      expect(context3.severity).toBe("high");

      const context4 = ErrorUtils.createContext("service", "operation", {
        severity: "critical",
      });
      expect(context4.severity).toBe("critical");
    });

    it("should skip severity validation when not provided (line 60)", () => {
      const context = ErrorUtils.createContext("service", "operation");
      expect(context.severity).toBe("medium"); // Default
    });
  });

  describe("getErrorMessage - error type branches", () => {
    it("should extract message from Error instance (line 85-86)", () => {
      const error = new Error("Test error message");
      const message = ErrorUtils.getErrorMessage(error);
      expect(message).toBe("Test error message");
    });

    it("should extract message from object with message property (line 88-90)", () => {
      const error = { message: "Object error message" };
      const message = ErrorUtils.getErrorMessage(error);
      expect(message).toBe("Object error message");
    });

    it("should convert non-Error, non-object to string (line 91)", () => {
      expect(ErrorUtils.getErrorMessage("string error")).toBe("string error");
      expect(ErrorUtils.getErrorMessage(123)).toBe("123");
      expect(ErrorUtils.getErrorMessage(null)).toBe("null");
      expect(ErrorUtils.getErrorMessage(undefined)).toBe("undefined");
    });

    it("should handle object without message property (line 88-91)", () => {
      const error = { code: "ERROR_CODE" };
      const message = ErrorUtils.getErrorMessage(error);
      expect(message).toBe("[object Object]");
    });
  });

  describe("createErrorResult - error type branches", () => {
    it("should extract message from Error instance (line 112)", () => {
      const error = new Error("Error message");
      const result = ErrorUtils.createErrorResult(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Error message");
      expect(result.errorCode).toBeUndefined();
    });

    it("should extract code from ServiceError instance (line 114)", () => {
      const error = new ServiceError("Service error", { code: "SERVICE_ERROR" });
      const result = ErrorUtils.createErrorResult(error);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Service error");
      expect(result.errorCode).toBe("SERVICE_ERROR");
    });

    it("should convert string error to message (line 112)", () => {
      const result = ErrorUtils.createErrorResult("String error");
      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
      expect(result.errorCode).toBeUndefined();
    });
  });

  describe("withErrorHandling - validation branches", () => {
    it("should throw when operation is not a function (line 131-136)", async () => {
      const context = ErrorUtils.createContext("service", "operation");
      
      await expect(
        ErrorUtils.withErrorHandling(null as any, context)
      ).rejects.toThrow(ServiceError);
      await expect(
        ErrorUtils.withErrorHandling("not a function" as any, context)
      ).rejects.toThrow(ServiceError);
    });

    it("should throw when context is null (line 138-143)", async () => {
      const operation = async () => "result";
      
      await expect(
        ErrorUtils.withErrorHandling(operation, null as any)
      ).rejects.toThrow(ServiceError);
    });

    it("should throw when context is not an object (line 138-143)", async () => {
      const operation = async () => "result";
      
      await expect(
        ErrorUtils.withErrorHandling(operation, "not an object" as any)
      ).rejects.toThrow(ServiceError);
    });

    it("should throw when context.source is missing (line 145-150)", async () => {
      const operation = async () => "result";
      const context = {
        message: "test",
        type: "service_error",
        operation: "test",
        timestamp: Date.now(),
        severity: "medium",
      } as any;
      
      await expect(
        ErrorUtils.withErrorHandling(operation, context)
      ).rejects.toThrow(ServiceError);
    });

    it("should throw when context.operation is missing (line 145-150)", async () => {
      const operation = async () => "result";
      const context = {
        message: "test",
        type: "service_error",
        source: "test",
        timestamp: Date.now(),
        severity: "medium",
      } as any;
      
      await expect(
        ErrorUtils.withErrorHandling(operation, context)
      ).rejects.toThrow(ServiceError);
    });

    it("should return success result when operation succeeds (line 152-154)", async () => {
      const operation = async () => "success result";
      const context = ErrorUtils.createContext("service", "operation");
      
      const result = await ErrorUtils.withErrorHandling(operation, context);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe("success result");
      expect(result.error).toBeUndefined();
    });

    it("should return error result when operation fails (line 155-168)", async () => {
      const operation = async () => {
        throw new Error("Operation failed");
      };
      const context = ErrorUtils.createContext("service", "operation");
      
      const result = await ErrorUtils.withErrorHandling(operation, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Operation failed");
      expect(result.data).toBeUndefined();
    });

    it("should return fallback when operation fails and fallback provided (line 163-165)", async () => {
      const operation = async () => {
        throw new Error("Operation failed");
      };
      const context = ErrorUtils.createContext("service", "operation");
      const fallback = "fallback value";
      
      const result = await ErrorUtils.withErrorHandling(operation, context, fallback);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe("fallback value");
      expect(result.error).toBeUndefined();
    });

    it("should return error result when operation fails and no fallback (line 167)", async () => {
      const operation = async () => {
        throw new Error("Operation failed");
      };
      const context = ErrorUtils.createContext("service", "operation");
      
      const result = await ErrorUtils.withErrorHandling(operation, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Operation failed");
      expect(result.data).toBeUndefined();
    });

    it("should handle non-Error throwables (line 155-168)", async () => {
      const operation = async () => {
        throw "String error";
      };
      const context = ErrorUtils.createContext("service", "operation");
      
      const result = await ErrorUtils.withErrorHandling(operation, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
    });
  });

  describe("setLogger", () => {
    it("should set custom logger", () => {
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      
      ErrorUtils.setLogger(mockLogger);
      
      // Verify logger is used by checking error handling
      const context = ErrorUtils.createContext("service", "operation");
      const operation = async () => {
        throw new Error("Test error");
      };
      
      return ErrorUtils.withErrorHandling(operation, context).then(() => {
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });
  });

  describe("handleError", () => {
    it("should log error with context", () => {
      const mockLogger: ILogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      
      ErrorUtils.setLogger(mockLogger);
      
      const context = ErrorUtils.createContext("service", "operation");
      const error = new Error("Test error");
      
      ErrorUtils.handleError(error, context);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error in service.operation",
        error,
        context
      );
    });
  });

  describe("createSuccessResult", () => {
    it("should create success result with data", () => {
      const data = { key: "value" };
      const result = ErrorUtils.createSuccessResult(data);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
    });

    it("should create success result with undefined data", () => {
      const result = ErrorUtils.createSuccessResult(undefined);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });
});

