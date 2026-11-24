/**
 * Failures that re-running the test cannot fix.
 *
 * Thrown only after the test has already waited and recovered as far as a
 * user could, for a cause outside both the app's UI and the test (e.g. the
 * content API returning a payload the app rejects). A Mocha retry would only
 * restart the app and sign in again to wait some more, which on a CI emulator
 * costs 3–4 min per attempt. afterTest (config/wdio.shared.conf.ts) therefore
 * stops Mocha's retries for it. A spec-file retry (SPEC_FILE_RETRIES, new
 * session) is decided by the launcher and still runs.
 */
export class NotRetryableError extends Error {
  override readonly name = 'NotRetryableError';
}

export const isNotRetryable = (error: unknown): boolean =>
  error instanceof NotRetryableError || (error as Error | undefined)?.name === 'NotRetryableError';
