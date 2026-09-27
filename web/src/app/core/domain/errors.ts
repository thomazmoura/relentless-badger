import { ENGLISH, Strings } from '../i18n/strings';

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

/**
 * A server URL TaskRepository.changeServer refused. Typed rather than carrying
 * a sentence, so the UI can say why in whichever language it speaks.
 */
export class InvalidServerUrlError extends Error {
  constructor(readonly blank: boolean) {
    super(blank ? 'Enter the server URL first.' : "That doesn't look like a valid http(s) URL.");
    this.name = 'InvalidServerUrlError';
  }
}

/** The message shown to the user, matching AppViewModel.friendly(). */
export function friendlyMessage(error: unknown, strings: Strings = ENGLISH): string {
  if (error instanceof NetworkError) {
    return strings.cannotReachServer;
  }
  if (error instanceof ApiError) {
    return error.status === 401 ? strings.sessionRejected : strings.serverError(error.status);
  }
  if (error instanceof InvalidServerUrlError) {
    return error.blank ? strings.enterServerUrl : strings.invalidServerUrl;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return strings.somethingWentWrong;
}
