import { ApiError, type BackendError } from './errors';

/**
 * Multipart upload with progress. `fetch` cannot report upload progress, so the
 * one endpoint family that needs a progress bar (`POST /import/{nep,met}`, plan
 * §Month 12) rides XHR instead of `lib/api/http.ts`.
 *
 * Same contract as the fetch client: same-origin to the BFF under `/api`, the
 * `x-requested-with` CSRF signal, and failures normalized to ApiError. The BFF
 * buffers the body once, so its silent-refresh retry replays multipart intact.
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<T> {
  const { onProgress, signal } = opts;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-requested-with', 'fetch');
    // Content-Type is intentionally unset: the browser must add the multipart
    // boundary itself, and the BFF forwards the header through untouched.

    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort);
    const cleanup = () => signal?.removeEventListener('abort', abort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };

    xhr.onload = () => {
      cleanup();
      // Upload finished; the server is still parsing. Show the bar as full.
      onProgress?.(1);

      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        body = undefined;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const envelope = body as { data?: T } | T;
        const data =
          envelope && typeof envelope === 'object' && 'data' in (envelope as Record<string, unknown>)
            ? (envelope as { data: T }).data
            : (envelope as T);
        resolve(data);
        return;
      }

      const err = (body ?? {}) as BackendError;
      const fieldMessages = Array.isArray(err.message) ? err.message : [];
      const message =
        err.error?.message ??
        (Array.isArray(err.message) ? err.message[0] : err.message) ??
        xhr.statusText ??
        'Upload failed';
      const retryAfter = Number(xhr.getResponseHeader('retry-after'));
      reject(
        new ApiError(
          xhr.status,
          err.error?.code ?? `HTTP_${xhr.status}`,
          message,
          fieldMessages,
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        ),
      );
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, 'NETWORK_ERROR', 'Network error during upload'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError(0, 'ABORTED', 'Upload cancelled'));
    };

    xhr.send(form);
  });
}
