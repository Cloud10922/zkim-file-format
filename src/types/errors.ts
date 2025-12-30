/**
 * Error Types and Classes for @zkim-platform/file-format
 * Lightweight error handling without platform dependencies
 */

export interface ErrorContext {
  message: string;
  type: string;
  source: string;
  operation: string;
  timestamp: number;
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
  service?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  context?: ErrorContext;
  metadata?: Record<string, unknown>;
}

/**
 * Base Service Error Class
 */
export class ServiceError extends Error {
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = options?.code;
    this.details = options?.details;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

/**
 * ZKIM File Format Specific Errors
 */
export class ZKIMFileError extends ServiceError {
  constructor(
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: options?.code || "ZKIM_FILE_ERROR",
      details: options?.details,
    });
    this.name = "ZKIMFileError";
    Object.setPrototypeOf(this, ZKIMFileError.prototype);
  }
}

export class ZKIMEncryptionError extends ServiceError {
  constructor(
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: options?.code || "ZKIM_ENCRYPTION_ERROR",
      details: options?.details,
    });
    this.name = "ZKIMEncryptionError";
    Object.setPrototypeOf(this, ZKIMEncryptionError.prototype);
  }
}

export class ZKIMIntegrityError extends ServiceError {
  constructor(
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: options?.code || "ZKIM_INTEGRITY_ERROR",
      details: options?.details,
    });
    this.name = "ZKIMIntegrityError";
    Object.setPrototypeOf(this, ZKIMIntegrityError.prototype);
  }
}

export class ZKIMStorageError extends ServiceError {
  constructor(
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: options?.code || "ZKIM_STORAGE_ERROR",
      details: options?.details,
    });
    this.name = "ZKIMStorageError";
    Object.setPrototypeOf(this, ZKIMStorageError.prototype);
  }
}

