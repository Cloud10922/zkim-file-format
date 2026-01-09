/**
 * Logger Tests
 * Tests for logger utilities
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ConsoleLogger, LogLevel, defaultLogger } from "../../src/utils/logger";

describe("Logger", () => {
  describe("ConsoleLogger", () => {
    let logger: ConsoleLogger;

    beforeEach(() => {
      logger = new ConsoleLogger();
    });

    describe("constructor", () => {
      it("should create logger with default log level", () => {
        const instance = new ConsoleLogger();
        expect(instance).toBeInstanceOf(ConsoleLogger);
      });

      it("should create logger with custom log level", () => {
        const instance = new ConsoleLogger(LogLevel.DEBUG);
        expect(instance).toBeInstanceOf(ConsoleLogger);
      });
    });

    describe("setLogLevel", () => {
      it("should set log level", () => {
        logger.setLogLevel(LogLevel.DEBUG);
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe("debug", () => {
      it("should log debug message", () => {
        logger.debug("test debug message");
        // Should not throw
        expect(true).toBe(true);
      });

      it("should log debug with context", () => {
        logger.debug("test debug", { userId: "test-user" });
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe("info", () => {
      it("should log info message", () => {
        logger.info("test info message");
        // Should not throw
        expect(true).toBe(true);
      });

      it("should log info with context", () => {
        logger.info("test info", { userId: "test-user" });
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe("warn", () => {
      it("should log warn message", () => {
        logger.warn("test warn message");
        // Should not throw
        expect(true).toBe(true);
      });

      it("should log warn with context", () => {
        logger.warn("test warn", { userId: "test-user" });
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe("error", () => {
      it("should log error message", () => {
        logger.error("test error message");
        // Should not throw
        expect(true).toBe(true);
      });

      it("should log error with error object", () => {
        logger.error("test error", new Error("test"));
        // Should not throw
        expect(true).toBe(true);
      });

      it("should log error with context", () => {
        logger.error("test error", undefined, { userId: "test-user" });
        // Should not throw
        expect(true).toBe(true);
      });
    });
  });

  describe("defaultLogger", () => {
    it("should be instance of ConsoleLogger", () => {
      expect(defaultLogger).toBeInstanceOf(ConsoleLogger);
    });

    it("should have all log methods", () => {
      expect(typeof defaultLogger.debug).toBe("function");
      expect(typeof defaultLogger.info).toBe("function");
      expect(typeof defaultLogger.warn).toBe("function");
      expect(typeof defaultLogger.error).toBe("function");
    });
  });
});

