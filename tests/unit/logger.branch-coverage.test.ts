/**
 * Logger Branch Coverage Tests
 * Targets specific branches to improve branch coverage metrics
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ConsoleLogger, LogLevel, defaultLogger } from "../../src/utils/logger";

describe("Logger - Branch Coverage", () => {
  let originalConsole: typeof console;

  beforeEach(() => {
    originalConsole = global.console;
  });

  afterEach(() => {
    global.console = originalConsole;
  });

  describe("ConsoleLogger - console method branches", () => {
    it("should handle console.debug being undefined (line 42-44)", () => {
      const logger = new ConsoleLogger(LogLevel.DEBUG);
      const mockConsole = {
        debug: undefined,
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.debug("Test message");
      // Should not throw, just skip logging
    });

    it("should handle console.info being undefined (line 51-53)", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);
      const mockConsole = {
        debug: jest.fn(),
        info: undefined,
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.info("Test message");
      // Should not throw, just skip logging
    });

    it("should handle console.warn being undefined (line 60-62)", () => {
      const logger = new ConsoleLogger(LogLevel.WARN);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: undefined,
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.warn("Test message");
      // Should not throw, just skip logging
    });

    it("should handle console.error being undefined (line 73-75)", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: undefined,
      };
      global.console = mockConsole as unknown as typeof console;

      logger.error("Test message");
      // Should not throw, just skip logging
    });

    it("should handle console being undefined (line 42, 51, 60, 73)", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);
      (global as any).console = undefined;

      // Should not throw
      logger.debug("Test message");
      logger.info("Test message");
      logger.warn("Test message");
      logger.error("Test message");
    });
  });

  describe("ConsoleLogger - formatMessage branches", () => {
    it("should handle context JSON.stringify failure (line 98-99)", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);
      const circularContext: Record<string, unknown> = {};
      circularContext.self = circularContext; // Create circular reference

      // Should not throw, should catch JSON.stringify error
      logger.info("Test message", circularContext);
    });

    it("should handle error without stack (line 106-108)", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const error = new Error("Test error");
      delete (error as any).stack; // Remove stack property

      logger.error("Test message", error);
      // Should handle error without stack
    });

    it("should handle error JSON.stringify failure (line 112-113)", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const circularError: any = {};
      circularError.self = circularError; // Create circular reference

      logger.error("Test message", circularError);
      // Should catch JSON.stringify error and use String(error)
    });

    it("should handle error that is not an Error instance (line 109-114)", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const nonError = { message: "Not an Error instance" };

      logger.error("Test message", nonError);
      // Should handle non-Error objects
    });

    it("should handle context being undefined (line 95-101)", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);

      logger.info("Test message", undefined);
      // Should handle undefined context
    });

    it("should handle error being undefined (line 103-116)", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);

      logger.error("Test message", undefined);
      // Should handle undefined error
    });
  });

  describe("ConsoleLogger - shouldLog branches", () => {
    it("should log DEBUG when level is DEBUG", () => {
      const logger = new ConsoleLogger(LogLevel.DEBUG);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.debug("Debug message");
      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should not log DEBUG when level is INFO", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.debug("Debug message");
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });

    it("should log INFO when level is INFO", () => {
      const logger = new ConsoleLogger(LogLevel.INFO);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.info("Info message");
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should log WARN when level is WARN", () => {
      const logger = new ConsoleLogger(LogLevel.WARN);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.warn("Warn message");
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should log ERROR when level is ERROR", () => {
      const logger = new ConsoleLogger(LogLevel.ERROR);
      const mockConsole = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      global.console = mockConsole as unknown as typeof console;

      logger.error("Error message");
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });
});

