/**
 * The guard that keeps `refresh_page` from looping the page.
 *
 * The sign-in chain ends in `refresh_page` whichever way it goes, and a
 * failure that repeats identically on every load would reload forever: each
 * load re-sends the chain, the chain fails the same way, its fallback reloads,
 * the reload resets the page-lifetime guards, and the page starts over. The
 * live walk of the sign-in modal (issue 112) looped exactly like this, 112
 * navigations in 20 seconds, silently, with no error on the console.
 *
 * The guard allows one automatic reload in a short window and blocks the rest.
 * The time of the last allowed reload sits in `sessionStorage`, which survives
 * the reload the chain just asked for, so the next load's own fallback sees it
 * and stops. When the guard blocks, it says on the console what the loop hid -
 * that the sign-in chain failed again and why the page is not reloaded - and
 * the page is left as it is.
 *
 * A reload the chain earned is not a loop step: when the `sign_in` action
 * reaches a session (`modalDomain.ts`), the stamp is dropped, so the chain's
 * tail can reload even moments after an earlier failure reload did.
 *
 * Storage is not guaranteed to work: a browser can block site data and a
 * sandboxed iframe throws on `sessionStorage` itself. Both callers sit on the
 * chain's critical path (the `refresh_page` handler and the success tail of
 * `sign_in`), so every storage access is guarded and the stamp also lives in
 * memory. Losing the stored stamp costs the guard only its reach across a
 * reload; it must never break the reload the page needs.
 *
 * A stamp from the future counts as stale. The system clock can move backward
 * after a correction, and a negative elapsed time must not block every reload
 * until the clock catches up.
 */

/**
 * How long after one automatic reload another one counts as a loop step.
 *
 * This bounds the loop's rate, not its existence: a failure that re-triggers
 * the chain more than one window after each reload (for example a background
 * request that keeps answering 401) is granted a fresh reload every window and
 * still reloads the page indefinitely, about once per window. Closing that gap
 * needs a page-lifetime attempt budget, which this guard does not keep.
 */
export const AUTOMATIC_RELOAD_WINDOW_MS = 10_000;

/** The sessionStorage key the stamp of the last allowed reload lives under. */
const LAST_RELOAD_AT_KEY = 'frontx.sign-in-chain.automatic-reload-at';

/**
 * The stamp as this page last wrote it, so a storage that throws still leaves
 * the guard working for the rest of the page's life. It does not survive a
 * reload, which is the only thing the stored stamp adds.
 */
let memoryStamp = 0;

/**
 * The stamp of the last allowed reload: the later of the stored one and the
 * one this page wrote, or 0 when neither exists.
 *
 * Reading the store is not enough on its own. A store can be readable but not
 * writable (a `QuotaExceededError` on `setItem`, a read-only store), and then
 * the stored value is 0 or stale while `writeStamp` updated only the memory
 * stamp: the guard would never see the reload it just allowed and the loop
 * protection would be lost. Taking the later of the two keeps the stored
 * stamp's reach across a reload (memory starts at 0 there) and the memory
 * stamp's freshness inside this page.
 */
function readStamp(): number {
  let stored = 0;
  try {
    stored = Number(sessionStorage.getItem(LAST_RELOAD_AT_KEY));
  } catch {
    // Storage unreadable: the in-memory stamp below is all this page has.
  }
  return Math.max(Number.isFinite(stored) ? stored : 0, memoryStamp);
}

/** Writes the stamp, or drops it when `value` is null, through storage and memory. */
function writeStamp(value: number | null): void {
  memoryStamp = value ?? 0;
  try {
    if (value === null) sessionStorage.removeItem(LAST_RELOAD_AT_KEY);
    else sessionStorage.setItem(LAST_RELOAD_AT_KEY, String(value));
  } catch {
    // Storage unavailable: the in-memory stamp is the best this page can do.
  }
}

/**
 * Asks for the one automatic reload the window allows. Returns true and stamps
 * the time when the reload may happen; returns false - and leaves the page as
 * it is - when a reload already happened inside the window, saying on the
 * console that the sign-in chain failed and why it is not reloaded again.
 */
export function claimAutomaticReload(): boolean {
  const previous = readStamp();
  const now = Date.now();
  const elapsed = now - previous;
  if (
    previous > 0 &&
    elapsed >= 0 &&
    elapsed < AUTOMATIC_RELOAD_WINDOW_MS
  ) {
    console.error(
      `[automaticReload] the sign-in chain failed: refresh_page wanted to reload the page ` +
        `${elapsed} ms after the page was already reloaded for the chain, so the chain failed ` +
        'the same way again and reloading once more would loop the page forever. ' +
        'The reload is skipped and the page is left as it is.',
    );
    return false;
  }
  writeStamp(now);
  return true;
}

/**
 * Drops the stamp: the `sign_in` action reached a session, so the chain's tail
 * reload is a reload the page needs, not a loop step.
 */
export function clearAutomaticReload(): void {
  writeStamp(null);
}
