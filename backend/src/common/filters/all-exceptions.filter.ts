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
    const statusCode = err.statusCode ?? 500;
    const code = err.code ?? 'INTERNAL_SERVER_ERROR';
    const message =
      statusCode === 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : (err.message ?? 'Unknown error');

    if (statusCode === 500) {
      console.error('[ERROR]', exception);
    }

    response.status(statusCode).json({ error: { code, message } });
  }
}
