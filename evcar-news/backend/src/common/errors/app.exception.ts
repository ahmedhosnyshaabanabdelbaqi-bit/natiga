import { HttpException, HttpStatus } from '@nestjs/common';
import type { LocalizedText } from '../i18n/localized-text';
import { ErrorCode, type ErrorCodeValue } from './error-codes';

export interface AppExceptionOptions {
  status: HttpStatus | number;
  /** SCREAMING_SNAKE_CASE machine-readable code. */
  code: ErrorCodeValue | (string & {});
  /** Localized message; defaults to the catalog message of `code`. */
  message?: LocalizedText | string;
  details?: unknown;
  /** Optional headers to add to the error response (e.g. Retry-After). */
  headers?: Record<string, string>;
  cause?: unknown;
}

/**
 * The single exception type modules should throw. Rendered by
 * AllExceptionsFilter as:
 *   { "error": { "code", "message" (localized), "details"?, "requestId" } }
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly localizedMessage?: LocalizedText | string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(opts: AppExceptionOptions) {
    const fallback =
      typeof opts.message === 'string' ? opts.message : (opts.message?.en ?? opts.code);
    super(fallback, opts.status, { cause: opts.cause });
    this.code = opts.code;
    this.localizedMessage = opts.message;
    this.details = opts.details;
    this.headers = opts.headers;
  }

  static badRequest(
    message?: LocalizedText | string,
    details?: unknown,
    code: string = ErrorCode.BAD_REQUEST,
  ) {
    return new AppException({ status: HttpStatus.BAD_REQUEST, code, message, details });
  }
  static validation(details: unknown, message?: LocalizedText | string) {
    return new AppException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.VALIDATION_FAILED,
      message,
      details,
    });
  }
  static unauthorized(code: string = ErrorCode.UNAUTHORIZED, message?: LocalizedText | string) {
    return new AppException({ status: HttpStatus.UNAUTHORIZED, code, message });
  }
  static forbidden(message?: LocalizedText | string, code: string = ErrorCode.FORBIDDEN) {
    return new AppException({ status: HttpStatus.FORBIDDEN, code, message });
  }
  static notFound(code: string = ErrorCode.NOT_FOUND, message?: LocalizedText | string) {
    return new AppException({ status: HttpStatus.NOT_FOUND, code, message });
  }
  static conflict(
    code: string = ErrorCode.CONFLICT,
    message?: LocalizedText | string,
    details?: unknown,
  ) {
    return new AppException({ status: HttpStatus.CONFLICT, code, message, details });
  }
  /** 503 for integrations whose keys/config are missing (contract §4.4, §4.6). */
  static integrationNotConfigured(integration: string, message?: LocalizedText | string) {
    return new AppException({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: ErrorCode.INTEGRATION_NOT_CONFIGURED,
      message,
      details: { integration },
    });
  }
  /** 501 for features that are deliberately not implemented yet. */
  static notImplemented(feature: string, message?: LocalizedText | string) {
    return new AppException({
      status: HttpStatus.NOT_IMPLEMENTED,
      code: ErrorCode.NOT_IMPLEMENTED,
      message,
      details: { feature },
    });
  }
}
