/**
 * Logger Interface and Console Implementation
 * Lightweight logging adapter for @zkim-platform/file-format package
 * 
 * Note: Console usage is required for this logger implementation in a standalone package.
 * Users can provide their own ILogger implementation to avoid console usage if needed.
 */

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>
  ): void;
}

/**
 * Console Logger Implementation
 * Simple console-based logger for standalone package usage
 */
export class ConsoleLogger implements ILogger {
  private logLevel: LogLevel;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /* eslint-disable no-console -- Console logger implementation requires console output */
  public debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatMessage("DEBUG", message, context);
      if (typeof console !== "undefined" && console.debug) {
        console.debug(formatted);
      }
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formatted = this.formatMessage("INFO", message, context);
      if (typeof console !== "undefined" && console.info) {
        console.info(formatted);
      }
    }
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formatted = this.formatMessage("WARN", message, context);
      if (typeof console !== "undefined" && console.warn) {
        console.warn(formatted);
      }
    }
  }

  public error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>
  ): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formatted = this.formatMessage("ERROR", message, context, error);
      if (typeof console !== "undefined" && console.error) {
        console.error(formatted);
      }
    }
  }
  /* eslint-enable no-console */

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  private formatMessage(
    level: string,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;

    if (context) {
      try {
        formatted += ` ${JSON.stringify(context)}`;
      } catch {
        formatted += ` [Context serialization failed]`;
      }
    }

    if (error) {
      if (error instanceof Error) {
        formatted += `\nError: ${error.message}`;
        if (error.stack) {
          formatted += `\nStack: ${error.stack}`;
        }
      } else {
        try {
          formatted += `\nError: ${JSON.stringify(error)}`;
        } catch {
          formatted += `\nError: ${String(error)}`;
        }
      }
    }

    return formatted;
  }
}

/**
 * Default logger instance
 */
export const defaultLogger: ILogger = new ConsoleLogger(LogLevel.INFO);

