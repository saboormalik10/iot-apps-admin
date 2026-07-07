/**
 * The backend's AllExceptionsFilter always emits `{ error: { code, message } }`
 * (HTTP + service layer), and the ValidationPipe yields `message[]`. Centralizing
 * the mapping is therefore safe — every failure funnels through ApiError.
 */
export interface BackendError {
  error?: { code?: string; message?: string; details?: unknown };
  message?: string | string[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field-level messages from the ValidationPipe (`message[]`), if any. */
  readonly fieldMessages: string[];
  /** Seconds to wait, parsed from `Retry-After` on a 429. */
  readonly retryAfterSec?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldMessages: string[] = [],
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldMessages = fieldMessages;
    this.retryAfterSec = retryAfterSec;
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let body: BackendError = {};
    try {
      body = (await res.json()) as BackendError;
    } catch {
      // Non-JSON error body — fall back to status text.
    }
    const code = body.error?.code ?? codeForStatus(res.status);
    const fieldMessages = Array.isArray(body.message) ? body.message : [];
    const message =
      body.error?.message ??
      (Array.isArray(body.message) ? body.message[0] : body.message) ??
      res.statusText ??
      'Request failed';
    const retryHeader = res.headers.get('retry-after');
    const retryAfterSec = retryHeader ? Number(retryHeader) : undefined;
    return new ApiError(res.status, code, message, fieldMessages, Number.isFinite(retryAfterSec) ? retryAfterSec : undefined);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'HTTP_' + status;
  }
}

/** Map an error to a user-facing i18n key (consumed by the toast/inline layer). */
export function messageKeyForError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return 'errors.unauthorized';
      case 403:
        return 'errors.forbidden';
      case 404:
        return 'errors.notFound';
      case 429:
        return 'errors.tooManyRequests';
      case 400:
        return 'errors.validation';
      default:
        return 'errors.generic';
    }
  }
  if (err instanceof TypeError) return 'errors.network';
  return 'errors.generic';
}
