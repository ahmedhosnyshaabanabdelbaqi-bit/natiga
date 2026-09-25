import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../errors/app.exception';
import { DEFAULT_ERROR_MESSAGES, ErrorCode, type ErrorCodeValue } from '../errors/error-codes';
import { pickLocalized, type LocalizedText } from '../i18n/localized-text';
// Pure catalog lookup (no DI): admin overrides of `errors.<CODE>` + bundled catalogs.
import { resolveErrorMessage } from '../../modules/i18n/server-messages';
import { resolveLanguage } from '../i18n/language';
import { RequestContext } from '../context/request-context';
import type { SupportedLanguage } from '../../config/app-config';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export interface NormalizedError {
  status: number;
  code: string;
  message?: LocalizedText | string;
  details?: unknown;
  headers?: Record<string, string>;
  /** Log as error with stack (unexpected failures). */
  unexpected?: boolean;
}

const STATUS_TO_CODE: Record<number, ErrorCodeValue> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  405: ErrorCode.METHOD_NOT_ALLOWED,
  409: ErrorCode.CONFLICT,
  410: ErrorCode.GONE,
  412: ErrorCode.PRECONDITION_FAILED,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  422: ErrorCode.VALIDATION_FAILED,
  429: ErrorCode.RATE_LIMITED,
  501: ErrorCode.NOT_IMPLEMENTED,
  502: ErrorCode.UPSTREAM_ERROR,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Renders every error as the contract envelope:
 *   { "error": { "code", "message" (localized ar/en), "details"?, "requestId" } }
 * Unknown errors become 500 INTERNAL_ERROR without leaking internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const normalized = this.normalize(exception);
    if (normalized.unexpected) {
      this.logger.error(
        {
          err: exception,
          requestId: requestIdOf(req, res),
          path: req.originalUrl?.split('?')[0],
          method: req.method,
        },
        'Unhandled exception',
      );
    }
    writeErrorResponse(req, res, normalized);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.localizedMessage,
        details: exception.details,
        headers: exception.headers,
      };
    }
    if (exception instanceof ThrottlerException) {
      return { status: HttpStatus.TOO_MANY_REQUESTS, code: ErrorCode.RATE_LIMITED };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ??
        (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
      // Nest's built-in messages ("Cannot GET /x") are English-only; use the
      // localized catalog message instead and keep the original in details
      // only for 4xx client errors that carry useful info.
      return { status, code, unexpected: status >= 500 };
    }
    const bodyParserError = fromBodyParserError(exception);
    if (bodyParserError) return bodyParserError;
    const prismaError = this.fromPrisma(exception);
    if (prismaError) return prismaError;
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      unexpected: true,
    };
  }

  /** Maps well-known Prisma errors to HTTP semantics. */
  private fromPrisma(exception: unknown): NormalizedError | undefined {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const target = (exception.meta as { target?: unknown } | undefined)?.target;
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            code: ErrorCode.CONFLICT,
            details: target ? { fields: target } : undefined,
          };
        case 'P2025':
        case 'P2001':
          return { status: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            code: ErrorCode.CONFLICT,
            details: { reason: 'foreign_key_constraint' },
          };
        case 'P2000':
          return {
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            code: ErrorCode.VALIDATION_FAILED,
            details: { reason: 'value_too_long' },
          };
        default:
          return (
            fromPostgresCode(exception) ?? {
              status: 500,
              code: ErrorCode.INTERNAL_ERROR,
              unexpected: true,
            }
          );
      }
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: 500, code: ErrorCode.INTERNAL_ERROR, unexpected: true };
    }
    return undefined;
  }
}

/** SQLSTATEs for text the database refuses (22021 NUL / invalid UTF-8, 22P05 untranslatable). */
const INVALID_TEXT_SQLSTATES = new Set(['22021', '22P05']);

/** SQLSTATE of a driver-adapter error wrapped by Prisma (P2039 / P2010 …), if any. */
function postgresCodeOf(exception: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = exception.meta as
    | {
        driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } };
        code?: unknown;
      }
    | undefined;
  const cause = meta?.driverAdapterError?.cause;
  const code = cause?.originalCode ?? cause?.code ?? meta?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Safety net for database rules that services should have checked first:
 * input PostgreSQL cannot store (NUL bytes) and integrity rules enforced by
 * CHECK constraints / triggers / exclusion constraints are the client's
 * fault (422 / 409), never a 500. Trigger messages start with the rule name
 * ("<table>_<rule>_chk: …"), which is returned as `details.constraint`.
 */
export function fromPostgresCode(
  exception: Prisma.PrismaClientKnownRequestError,
): NormalizedError | undefined {
  const code = postgresCodeOf(exception);
  if (!code) return undefined;
  if (INVALID_TEXT_SQLSTATES.has(code)) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.VALIDATION_FAILED,
      details: { reason: 'invalid_characters' },
    };
  }
  const constraint = constraintNameOf(exception);
  if (code === '23514') {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.VALIDATION_FAILED,
      details: { reason: 'constraint_violation', ...(constraint ? { constraint } : {}) },
    };
  }
  if (code === '23P01') {
    return {
      status: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
      details: { reason: 'overlapping_period', ...(constraint ? { constraint } : {}) },
    };
  }
  return undefined;
}

function constraintNameOf(exception: Prisma.PrismaClientKnownRequestError): string | undefined {
  const cause = (
    exception.meta as
      | { driverAdapterError?: { cause?: { originalMessage?: unknown; constraint?: unknown } } }
      | undefined
  )?.driverAdapterError?.cause;
  if (typeof cause?.constraint === 'string') return cause.constraint;
  const message = typeof cause?.originalMessage === 'string' ? cause.originalMessage : '';
  return (
    /^([a-z][a-z0-9_]*_(?:chk|uniq|no_overlap))\b/.exec(message)?.[1] ??
    /constraint "([a-z0-9_]+)"/.exec(message)?.[1]
  );
}

/** Maps errors raised by express body parsers (invalid JSON, too large...). */
export function fromBodyParserError(exception: unknown): NormalizedError | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const e = exception as { type?: string };
  switch (e.type) {
    case 'entity.parse.failed':
      return { status: 400, code: ErrorCode.INVALID_JSON };
    case 'entity.too.large':
      return { status: 413, code: ErrorCode.PAYLOAD_TOO_LARGE };
    case 'entity.verify.failed':
    case 'request.aborted':
    case 'request.size.invalid':
    case 'stream.encoding.set':
      return { status: 400, code: ErrorCode.BAD_REQUEST };
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return { status: 415, code: ErrorCode.UNSUPPORTED_MEDIA_TYPE };
    default:
      return undefined;
  }
}

export function requestIdOf(req: Request, res: Response): string {
  const id = (req as Request & { id?: unknown }).id;
  if (typeof id === 'string' && id) return id;
  const fromCtx = RequestContext.requestId();
  if (fromCtx) return fromCtx;
  const header = res.getHeader('x-request-id');
  return typeof header === 'string' ? header : 'unknown';
}

export function languageOf(req: Request): SupportedLanguage {
  const fromReq = (req as Request & { locale?: { lang?: SupportedLanguage } }).locale?.lang;
  if (fromReq) return fromReq;
  const fromCtx = RequestContext.get()?.lang;
  if (fromCtx) return fromCtx;
  return resolveLanguage(
    typeof req.query?.lang === 'string' ? req.query.lang : undefined,
    req.headers?.['accept-language'],
    'ar',
  );
}

/** Writes the contract error envelope for a normalized error. */
export function writeErrorResponse(req: Request, res: Response, normalized: NormalizedError): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const lang = languageOf(req);
  const message =
    pickLocalized(normalized.message, lang) ??
    resolveErrorMessage(normalized.code, lang) ??
    pickLocalized(DEFAULT_ERROR_MESSAGES[normalized.code as ErrorCodeValue], lang) ??
    pickLocalized(
      DEFAULT_ERROR_MESSAGES[STATUS_TO_CODE[normalized.status] ?? ErrorCode.INTERNAL_ERROR],
      lang,
    )!;
  const body: ErrorEnvelope = {
    error: {
      code: normalized.code,
      message,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
      requestId: requestIdOf(req, res),
    },
  };
  for (const [k, v] of Object.entries(normalized.headers ?? {})) res.setHeader(k, v);
  res.setHeader('Cache-Control', 'no-store');
  res.status(normalized.status).json(body);
}

/**
 * Express error middleware placed right after the body parsers (see
 * configureApp): renders parse errors as the error envelope.
 */
export function bodyParserErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: (err?: unknown) => void,
): void {
  const normalized = fromBodyParserError(err);
  if (!normalized) {
    next(err);
    return;
  }
  writeErrorResponse(req, res, normalized);
}
