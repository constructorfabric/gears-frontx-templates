import { describe, expect, it } from 'vitest';
import {
  absoluteDate,
  labelOf,
  longRelativeTime,
  messageDayKey,
  messageDayLabel,
  messageTimeOfDay,
  monthLabel,
  shortRelativeTime,
  weekdayLabel,
} from './format';
import { t } from './i18n';

/** A local wall-clock instant as the ISO string the data carries. */
const at = (year: number, month: number, day: number, hour = 0, minute = 0): string =>
  new Date(year, month - 1, day, hour, minute).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('messageDayKey', () => {
  it('gives two messages on the same local day the same key, and a different day a different one', () => {
    const morning = messageDayKey(at(2026, 8, 21, 8, 21));
    const evening = messageDayKey(at(2026, 8, 21, 22, 1));
    const nextDay = messageDayKey(at(2026, 8, 22, 0, 5));
    expect(morning).toBe(evening);
    expect(morning).not.toBe(nextDay);
  });
});

describe('messageDayLabel and messageTimeOfDay', () => {
  it('writes the divider as month and day, and the bubble as the time of day', () => {
    expect(messageDayLabel(at(2026, 8, 21, 8, 21))).toBe('Aug 21');
    expect(messageDayLabel(at(2027, 1, 3, 9))).toBe('Jan 3');
    expect(messageTimeOfDay(at(2026, 8, 21, 8, 21))).toBe('8:21 AM');
    expect(messageTimeOfDay(at(2026, 12, 31, 23, 59))).toBe('11:59 PM');
  });
});

describe('absoluteDate', () => {
  it('writes a calendar date, and the missing-value dash for an empty instant', () => {
    expect(absoluteDate(at(2025, 6, 27, 12))).toBe('Jun 27, 2025');
    expect(absoluteDate('')).toBe('-');
  });
});

describe('chart axis labels', () => {
  it('names the weekday and the month of an instant', () => {
    expect(weekdayLabel(at(2026, 9, 28, 12))).toBe('Mon');
    expect(monthLabel(at(2026, 1, 1))).toBe('Jan');
  });
});

describe('shortRelativeTime', () => {
  const now = Date.UTC(2026, 8, 29, 12);

  it('counts minutes, hours and days in their narrow form', () => {
    expect(shortRelativeTime(new Date(now - 26 * MINUTE).toISOString(), now)).toBe('26m');
    expect(shortRelativeTime(new Date(now - 90 * MINUTE).toISOString(), now)).toBe('1h');
    expect(shortRelativeTime(new Date(now - 4 * DAY).toISOString(), now)).toBe('4d');
  });

  it('never reads under a minute, and treats a future instant as just now', () => {
    expect(shortRelativeTime(new Date(now - 10_000).toISOString(), now)).toBe('1m');
    expect(shortRelativeTime(new Date(now + HOUR).toISOString(), now)).toBe('1m');
  });
});

describe('longRelativeTime', () => {
  const now = Date.UTC(2026, 8, 29, 12);
  const ago = (elapsed: number) => longRelativeTime(new Date(now - elapsed).toISOString(), t, now);

  it('says just now under a minute, from the catalogue', () => {
    expect(ago(20_000)).toBe(t('just_now'));
  });

  it('picks the largest whole unit and its singular or plural form', () => {
    expect(ago(MINUTE)).toBe('1 minute ago');
    expect(ago(3 * HOUR)).toBe('3 hours ago');
    expect(ago(DAY)).toBe('1 day ago');
    expect(ago(65 * DAY)).toBe('2 months ago');
    expect(ago(800 * DAY)).toBe('2 years ago');
  });
});

describe('labelOf', () => {
  it('labels a value through its own catalogue key', () => {
    expect(labelOf('none', t)).toBe('No priority');
    expect(labelOf('online', t)).toBe('Online');
  });
});
