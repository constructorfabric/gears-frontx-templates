/**
 * The clock every seed dataset is written against.
 *
 * Instants are resolved once, at module load, as offsets back from
 * `ANCHOR_MS`. That is what keeps the lists reading "1h" and "4d" on any run
 * day instead of drifting further from the day the content was written, and
 * one shared anchor is what keeps the inbox, mail and dashboard datasets
 * agreeing with each other about what "an hour ago" was.
 *
 * The transcript and the mail history show calendar text rather than relative
 * times, so this module also owns the one formatter that text is written in:
 * a seeded message and a message the agent posts a minute ago read the same.
 */

/** Resolved once per page load; every offset below is measured back from it. */
export const ANCHOR_MS = Date.now();

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const minutesAgo = (minutes: number): string =>
  new Date(ANCHOR_MS - minutes * MINUTE_MS).toISOString();

export const hoursAgo = (hours: number): string =>
  new Date(ANCHOR_MS - hours * HOUR_MS).toISOString();

export const daysAgo = (days: number): string => hoursAgo(days * 24);

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Calendar text in the transcript's format: "Aug 21, 2026 - 8:21 AM". The date
 * half is what the thread groups its day dividers by (`messageDayKey` in
 * `shared/format.ts`), so every writer of `Message.timestamp` goes through here.
 */
export const calendarText = (at: Date): string =>
  `${dateFormat.format(at)} - ${timeFormat.format(at)}`;

/** Calendar text for an instant `minutes` before the anchor. */
export const calendarTextMinutesAgo = (minutes: number): string =>
  calendarText(new Date(ANCHOR_MS - minutes * MINUTE_MS));
