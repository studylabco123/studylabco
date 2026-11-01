/** What every admin operation returns; `message` is shown to the admin as-is. */
export type Failure = { ok: false; message: string };
export type AdminResult = { ok: true } | Failure;

export const OK: AdminResult = { ok: true };
export const fail = (message: string): Failure => ({ ok: false, message });

export interface OpOptions {
  /** Tests pin the clock. */
  now?: Date;
}

/** The default message when the database itself fails; details go to the server log. */
export function unexpected(what: string, error: { message: string }): Failure {
  console.error(`admin: ${what} failed`, error.message);
  return fail("Something went wrong. Please try again.");
}

/** Booking ids are uuids from forms: an invalid one is just 'not found'. */
export const NOT_FOUND = fail("We could not find that booking.");
