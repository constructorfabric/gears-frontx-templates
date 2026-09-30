/**
 * The clock every seed dataset is written against.
 *
 * Instants are resolved once, at module load, as offsets back from
 * `ANCHOR_MS`. That is what keeps the lists reading "1h" and "4d" on any run
 * day instead of drifting further from the day the content was written, and
 * one shared anchor is what keeps every screen's dataset agreeing with the
 * others about what "an hour ago" was, whichever package bundles it.
 *
 * Every instant is an ISO string, the transcript's included: how an instant
 * reads on screen is the formatters' concern (`ui/format.ts`), in the
 * screens' locale, never the data's.
 */

/**
 * The registry key the anchor lives under. Each screen package bundles its
 * own copy of this module and evaluates it at its own load time, so a
 * module-level `Date.now()` would give every screen a different "now"; the
 * first package to load writes the anchor on `globalThis`, as the mock store
 * does, and every later one reads it.
 */
export const SEED_ANCHOR_KEY = Symbol.for('@gears-frontx/frontx-template-inbox/seed-anchor/v1');

type AnchorRealm = typeof globalThis & { [SEED_ANCHOR_KEY]?: number };

const readAnchor = (): number => {
  const page = globalThis as AnchorRealm;
  const existing = page[SEED_ANCHOR_KEY];
  if (typeof existing === 'number') return existing;
  const created = Date.now();
  page[SEED_ANCHOR_KEY] = created;
  return created;
};

/** Resolved once per page load, whichever package loads first; every offset below is measured back from it. */
export const ANCHOR_MS = readAnchor();

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const minutesAgo = (minutes: number): string =>
  new Date(ANCHOR_MS - minutes * MINUTE_MS).toISOString();

export const hoursAgo = (hours: number): string =>
  new Date(ANCHOR_MS - hours * HOUR_MS).toISOString();

export const daysAgo = (days: number): string => hoursAgo(days * 24);
