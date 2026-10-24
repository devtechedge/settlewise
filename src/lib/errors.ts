export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_MONEY"
  | "UNSUPPORTED_CURRENCY"
  | "AMOUNT_TOO_LARGE"
  | "INVALID_ALLOCATION"
  | "INVALID_PERCENTAGE"
  | "INVALID_SHARES"
  | "DUPLICATE_BENEFICIARY"
  | "BALANCE_INVARIANT"
  | "CURRENCY_MISMATCH"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_REVISION"
  | "INVALID_STATE"
  | "DUPLICATE_IMPORT"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_MONEY: 400,
  UNSUPPORTED_CURRENCY: 400,
  AMOUNT_TOO_LARGE: 400,
  INVALID_ALLOCATION: 400,
  INVALID_PERCENTAGE: 400,
  INVALID_SHARES: 400,
  DUPLICATE_BENEFICIARY: 400,
  BALANCE_INVARIANT: 500,
  CURRENCY_MISMATCH: 409,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  INVALID_STATE: 409,
  DUPLICATE_IMPORT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function errorBody(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
