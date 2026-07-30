/**
 * The two failure shapes the business logic branches on, mirroring what the
 * Android app catches: a connection that never reached the server, and a
 * response the server rejected with a status code.
 */

/** ConnectException / SocketTimeoutException: the request never got an answer. */
export class NetworkError extends Error {
  constructor(message = 'Cannot reach the server.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** HttpException: the server answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message = `Server error (${status}).`,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The message shown to the user, matching AppViewModel.friendly(). */
export function friendlyMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Cannot reach the server. Check the URL and your network.';
  }
  if (error instanceof ApiError) {
    return error.status === 401
      ? 'Session rejected by the server. Try signing in again.'
      : `Server error (${error.status}).`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong.';
}
