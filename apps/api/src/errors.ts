/**
 * Typed error class for TestForge API errors
 *
 * All API errors extend this class for consistent error handling
 * and proper HTTP status code mapping.
 */
export class TestForgeError extends Error {
  /** HTTP status code */
  readonly statusCode: number;
  /** Machine-readable error code */
  readonly code: string;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TestForgeError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // captureStackTrace is V8-only; safe to call conditionally
    if (typeof (Error as unknown as Record<string, unknown>).captureStackTrace === "function") {
      (Error as unknown as { captureStackTrace: (t: Error, c: unknown) => void }).captureStackTrace(this, TestForgeError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** 400 Bad Request */
export class ValidationError extends TestForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/** 401 Unauthorized */
export class UnauthorizedError extends TestForgeError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/** 403 Forbidden */
export class ForbiddenError extends TestForgeError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

/** 404 Not Found */
export class NotFoundError extends TestForgeError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404,
      "NOT_FOUND"
    );
    this.name = "NotFoundError";
  }
}

/** 409 Conflict */
export class ConflictError extends TestForgeError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

/** 429 Too Many Requests */
export class RateLimitError extends TestForgeError {
  constructor(retryAfter?: number) {
    super("Rate limit exceeded", 429, "RATE_LIMIT_EXCEEDED", {
      retryAfter,
    });
    this.name = "RateLimitError";
  }
}

/** 501 Not Implemented */
export class NotImplementedError extends TestForgeError {
  constructor(feature: string) {
    super(`${feature} is not yet implemented`, 501, "NOT_IMPLEMENTED");
    this.name = "NotImplementedError";
  }
}

/** License-related error */
export class LicenseError extends TestForgeError {
  constructor(feature: string) {
    super(
      `Enterprise license required for feature: ${feature}`,
      403,
      "LICENSE_REQUIRED",
      { feature }
    );
    this.name = "LicenseError";
  }
}
