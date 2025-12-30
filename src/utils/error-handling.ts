/**
 * Error Handling Utilities for @zkim-platform/file-format
 * Lightweight error handling without platform dependencies
 */

import type { ErrorContext, ServiceResult } from "../types/errors";
import { ServiceError } from "../types/errors";
import type { ILogger } from "./logger";
import { defaultLogger } from "./logger";

/**
 * Error handling utilities for services
 */
export class ErrorUtils {
  private static logger: ILogger = defaultLogger;

  /**
   * Set custom logger instance
   */
  public static setLogger(logger: ILogger): void {
    ErrorUtils.logger = logger;
  }

  /**
   * Create error context for consistent error handling
   */
  public static createContext(
    service: string,
    operation: string,
    additionalContext?: Record<string, unknown>
  ): ErrorContext {
    if (!service || typeof service !== "string") {
      throw new ServiceError("Service name is required and must be a string", {
        code: "INVALID_ERROR_CONTEXT",
        details: { service, operation },
      });
    }

    if (!operation || typeof operation !== "string") {
      throw new ServiceError(
        "Operation name is required and must be a string",
        {
          code: "INVALID_ERROR_CONTEXT",
          details: { service, operation },
        }
      );
    }

    const context: ErrorContext = {
      message: `${service}: ${operation}`,
      type: "service_error",
      source: service,
      operation,
      timestamp: Date.now(),
      severity: "medium",
      ...additionalContext,
    };

    // Validate severity if provided
    if (additionalContext?.severity) {
      const validSeverities = ["low", "medium", "high", "critical"];
      const severityValue = String(additionalContext.severity);
      if (!validSeverities.includes(severityValue)) {
        throw new ServiceError(
          `Invalid severity level: ${severityValue}. Must be one of: ${validSeverities.join(", ")}`,
          {
            code: "INVALID_ERROR_CONTEXT",
            details: {
              service,
              operation,
              severity: additionalContext.severity,
            },
          }
        );
      }
    }

    return context;
  }

  /**
   * Extract error message from unknown error type
   */
  public static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  /**
   * Create a successful service result
   */
  public static createSuccessResult<T>(data: T): ServiceResult<T> {
    return {
      success: true,
      data,
      error: undefined,
    };
  }

  /**
   * Create a failed service result
   */
  public static createErrorResult<T>(
    error: string | Error
  ): ServiceResult<T> {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorCode =
      error instanceof ServiceError ? error.code : undefined;
    return {
      success: false,
      data: undefined as T | undefined,
      error: errorMessage,
      errorCode,
    };
  }

  /**
   * Wrap async operations with error handling
   */
  public static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallback?: T
  ): Promise<ServiceResult<T>> {
    if (!operation || typeof operation !== "function") {
      throw new ServiceError("Operation must be a function", {
        code: "INVALID_OPERATION",
        details: { context },
      });
    }

    if (!context || typeof context !== "object") {
      throw new ServiceError("Context is required and must be an object", {
        code: "INVALID_ERROR_CONTEXT",
        details: { context },
      });
    }

    if (!context.source || !context.operation) {
      throw new ServiceError("Context must include source and operation", {
        code: "INVALID_ERROR_CONTEXT",
        details: { context },
      });
    }

    try {
      const result = await operation();
      return this.createSuccessResult(result);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      ErrorUtils.logger.error(
        `Error in ${context.source}.${context.operation}`,
        error,
        context
      );

      if (fallback !== undefined) {
        return this.createSuccessResult(fallback);
      }

      return this.createErrorResult(errorMessage);
    }
  }

  /**
   * Handle errors with context and logging
   */
  public static handleError(error: unknown, context: ErrorContext): void {
    ErrorUtils.logger.error(
      `Error in ${context.source}.${context.operation}`,
      error,
      context
    );
  }
}

