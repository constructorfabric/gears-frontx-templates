import { describe, expect, it } from 'vitest';
import { labelOf, messageDayKey, messageDayLabel, messageTimeOfDay } from './format';

describe('messageDayKey', () => {
  it('reads the calendar-date prefix off a transcript timestamp', () => {
    expect(messageDayKey('Aug 21, 2026 - 8:21 AM')).toBe('Aug 21, 2026');
  });

  it('gives two messages on the same day the same key, and a different day a different one', () => {
    const morning = messageDayKey('Aug 21, 2026 - 8:21 AM');
    const evening = messageDayKey('Aug 21, 2026 - 10:01 AM');
    const nextDay = messageDayKey('Aug 22, 2026 - 8:21 AM');
    expect(morning).toBe(evening);
    expect(morning).not.toBe(nextDay);
  });
});

describe('messageDayLabel', () => {
  it('drops the year and time, leaving month and day', () => {
    expect(messageDayLabel('Aug 21, 2026 - 8:21 AM')).toBe('Aug 21');
  });
});

describe('messageTimeOfDay', () => {
  it('keeps only the time-of-day half of a transcript timestamp', () => {
    expect(messageTimeOfDay('Aug 21, 2026 - 8:21 AM')).toBe('8:21 AM');
  });

  it('returns the input unchanged if it has no " - " separator', () => {
    expect(messageTimeOfDay('8:21 AM')).toBe('8:21 AM');
  });
});

describe('messageDayLabel parsing', () => {
  it('reads every month abbreviation without relying on non-ISO Date parsing', () => {
    expect(messageDayLabel('Jan 3, 2027 - 9:00 AM')).toBe('Jan 3');
    expect(messageDayLabel('Dec 31, 2026 - 11:59 PM')).toBe('Dec 31');
  });

  it('shows a key it cannot read as it is, rather than an invalid date', () => {
    expect(messageDayLabel('yesterday - 8:21 AM')).toBe('yesterday');
  });
});

describe('labelOf', () => {
  it('labels a value that does not capitalise into its label', () => {
    expect(labelOf('none')).toBe('No priority');
    expect(labelOf('online')).toBe('Online');
  });
});
