import { ApiError } from './api-error';

const connectionFailureMessage =
  'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.';
const timeoutMessage =
  'O serviço demorou demais para responder. Verifique sua conexão e tente novamente.';
const defaultRequestTimeoutMs = 12_000;
const longRequestTimeoutMs = 120_000;
/** Deadline for photo uploads and PDF downloads, which outlast the default 12 s budget. */
export function longRequestSignal(): AbortSignal {
  return AbortSignal.timeout(longRequestTimeoutMs);
}
function transportFailure(error: unknown): ApiError {
  const timedOut =
    error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return new ApiError(0, timedOut ? timeoutMessage : connectionFailureMessage);
}
/** Sends one request to the API, turning network failures and timeouts into an ApiError. */
export async function sendApiRequest(
  transport: typeof fetch,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<Response> {
  try {
    return await transport(`/api/v1${path}`, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(defaultRequestTimeoutMs),
      headers: {
        ...(init.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    throw transportFailure(error);
  }
}
/** Reads a response body, reporting a stalled or dropped stream as a connection failure. */
export async function readResponseBody<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof DOMException || error instanceof TypeError) throw transportFailure(error);
    throw error;
  }
}
