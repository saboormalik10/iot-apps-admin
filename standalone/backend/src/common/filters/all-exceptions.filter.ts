import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  /**
   * Extra machine-readable context for the client, e.g. how many users hold a
   * role that cannot be deleted. An explicit field rather than spreading the
   * error object, so an internal property can never leak into a response.
   */
  details?: Record<string, unknown>;
}

/** Mongo/BSON complaints that are really "the caller sent nonsense". */
function isBadClientValue(err: AppError & { name?: string; code?: unknown }): boolean {
  if (err.statusCode) return false;
  if (err.name === 'CastError' || err.name === 'BSONError' || err.name === 'BSONTypeError') return true;
  // 51024: a negative skip. 2 (BadValue) and 51075: values Mongo will not take.
  return err.name === 'MongoServerError' && [2, 51024, 51075].includes(Number(err.code));
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // If caller already structured as { error: { code, message } }, pass through
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'error' in (exceptionResponse as Record<string, unknown>)
      ) {
        response.status(status).json(exceptionResponse);
        return;
      }

      // NestJS default string or object
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).message ?? exception.message;
      response
        .status(status)
        .json({ error: { code: `HTTP_${status}`, message } });
      return;
    }

    // Service-layer errors: Object.assign(new Error(...), { statusCode, code })
    const err = exception as AppError;
    // A value the caller supplied that Mongo could not use: a malformed id
    // ("zzz" where an id belongs), a negative page, a NaN. These arrive here as
    // BSON/Mongoose/Mongo errors and used to answer 500 — a server fault for
    // what is a bad request, on every unvalidated query parameter.
    if (isBadClientValue(err)) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'One of the values in this request is not valid.' },
      });
      return;
    }
    const statusCode = err.statusCode ?? 500;
    // A MongoServerError's `code` is a NUMBER, and it used to be sent as the API's
    // error code (51024, 11000 …), naming the failure to the caller and breaking
    // the documented contract of a string code.
    const code = typeof err.code === 'string' ? err.code : 'INTERNAL_SERVER_ERROR';
    const message =
      statusCode === 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : (err.message ?? 'Unknown error');

    if (statusCode === 500) {
      console.error('[ERROR]', exception);
    }

    response
      .status(statusCode)
      .json({ error: { code, message, ...(err.details ? { details: err.details } : {}) } });
  }
}
