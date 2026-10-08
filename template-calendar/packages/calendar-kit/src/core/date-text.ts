/** Reads free-typed or pasted date text into a `CalendarDate`, following the locale's own date order. */

import { toAsciiDigits } from "./digits";
import { dateTimeFormatter } from "./intl-cache";
import type { CalendarDate } from "./model";
import { calendarDate } from "./validation";

export const DATE_INPUT = {
  empty: "empty",
  invalid: "invalid",
  value: "value",
} as const;

export type DateInputKind = (typeof DATE_INPUT)[keyof typeof DATE_INPUT];

export type DateInputResult =
  | { readonly kind: typeof DATE_INPUT.value; readonly value: CalendarDate }
  | { readonly kind: typeof DATE_INPUT.empty }
  | { readonly kind: typeof DATE_INPUT.invalid };

export interface ParseDateInputOptions {
  readonly locale: string;
  /** Supplies the parts the text leaves out - a bare day keeps this month and year. */
  readonly reference: CalendarDate;
}

const ISO_DATE_PATTERN =
  /^(?<group1>\d{4})-(?<group2>\d{1,2})-(?<group3>\d{1,2})$/u;

// Digit runs and word runs; everything else separates. Splitting on non-letters alone kept
// `2026年3月5日` as one token, because CJK unit suffixes are letters.
const DATE_TOKEN_PATTERN = /\p{Nd}+|[\p{L}\p{M}]+/gu;

const DIGITS_ONLY_PATTERN = /^\d+$/u;

const WORD_PATTERN = /[\p{L}\p{M}]+/gu;

// th `ก.พ.` and ru `г.` abbreviate with dots; dropped after a letter they read as one word,
// while dots between digits (`22.9.2026`) still separate.
const ABBREVIATION_DOT_PATTERN = /(?<=[\p{L}\p{M}])\./gu;

const DAYS_PER_WEEK = 7;

const MONTHS_PER_YEAR = 12;

const MAX_DAY_OF_MONTH = 31;

const TWO_DIGIT_YEAR_LIMIT = 100;

const CENTURY = 2000;

const MIN_MONTH_NAME_LENGTH = 3;

type DateFieldName = "day" | "month" | "year";

interface DateInputParts {
  readonly day: number;
  readonly month?: number;
  readonly year?: number;
}

interface DateVocabulary {
  /** A word that names exactly one month, in any form the locale writes it. */
  readonly months: ReadonlyMap<string, number>;
  /** Weekdays, suffixes such as 年 or г., and words shared by several month names. */
  readonly ignored: ReadonlySet<string>;
}

// Gregorian words only: a locale's own calendar (fa, -u-ca-islamic) would map its month
// names onto the wrong Gregorian month numbers.
const GREGORIAN_UTC = {
  calendar: "gregory",
  numberingSystem: "latn",
  timeZone: "UTC",
} as const;

// Standalone and format-form month names, plus the words full dates put around them.
const MONTH_FORMATS: readonly Intl.DateTimeFormatOptions[] = [
  { month: "long" },
  { month: "short" },
  { day: "numeric", month: "long" },
  { day: "numeric", month: "short" },
  { dateStyle: "medium" },
  { dateStyle: "long" },
  { dateStyle: "full" },
];

const WEEKDAY_FORMATS: readonly Intl.DateTimeFormatOptions[] = [
  { weekday: "long" },
  { weekday: "short" },
];

const vocabularies = new Map<string, DateVocabulary>();

const dateFieldOrders = new Map<string, readonly DateFieldName[]>();

const withoutAbbreviationDots = (text: string): string =>
  text.replaceAll(ABBREVIATION_DOT_PATTERN, "");

const words = (text: string): readonly string[] =>
  withoutAbbreviationDots(text.toLowerCase()).match(WORD_PATTERN) ?? [];

/**
 * The words the locale itself writes around a date, read from its formatter output.
 * Month names come in both the standalone form and the format form a date is written
 * with (ru `сентябрь` and `сентября`), so the kit's own output parses back.
 */
const dateVocabulary = (locale: string): DateVocabulary => {
  const cached = vocabularies.get(locale);

  if (cached) {
    return cached;
  }

  const monthsByWord = new Map<string, Set<number>>();
  const ignored = new Set<string>();

  // `month` 0 marks a sample read only for its other words.
  const collect = (
    options: Intl.DateTimeFormatOptions,
    sample: Date,
    month: number
  ): void => {
    const formatter = dateTimeFormatter(locale, {
      ...GREGORIAN_UTC,
      ...options,
    });

    for (const part of formatter.formatToParts(sample)) {
      for (const word of words(part.value)) {
        if (part.type === "month") {
          monthsByWord.set(
            word,
            (monthsByWord.get(word) ?? new Set()).add(month)
          );
        } else {
          ignored.add(word);
        }
      }
    }
  };

  for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
    const sample = new Date(Date.UTC(2021, month - 1, 15, 12));

    for (const options of MONTH_FORMATS) {
      collect(options, sample, month);
    }
  }

  for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
    const sample = new Date(Date.UTC(2021, 0, 4 + day, 12));

    for (const options of WEEKDAY_FORMATS) {
      collect(options, sample, 0);
    }
  }

  const months = new Map<string, number>();

  // A word in several month names (vi `tháng`, ca `de`) identifies none of them.
  for (const [word, found] of monthsByWord) {
    if (found.size === 1) {
      months.set(word, [...found][0]);
    } else {
      ignored.add(word);
    }
  }

  const vocabulary = { ignored, months };
  vocabularies.set(locale, vocabulary);

  return vocabulary;
};

/**
 * The order in which the locale writes a date, e.g. month, day, year for en-US. A named
 * month can reorder the rest: fa writes `1404/1/2` but `22 ژانویه 2026`.
 */
const dateFieldOrder = (
  locale: string,
  month: "long" | "numeric"
): readonly DateFieldName[] => {
  const key = `${locale}\u0000${month}`;
  const cached = dateFieldOrders.get(key);

  if (cached) {
    return cached;
  }

  const order = dateTimeFormatter(locale, {
    ...GREGORIAN_UTC,
    day: "numeric",
    month,
    year: "numeric",
  })
    .formatToParts(new Date(Date.UTC(2021, 0, 2, 12)))
    .flatMap((part) =>
      part.type === "day" || part.type === "month" || part.type === "year"
        ? [part.type]
        : []
    );

  dateFieldOrders.set(key, order);

  return order;
};

type WordMatch =
  | { readonly kind: "month"; readonly month: number }
  | { readonly kind: "ignored" }
  | { readonly kind: "unknown" };

/** The lowest month whose name starts with a typed prefix such as `sept`. */
const matchMonthPrefix = (
  word: string,
  months: ReadonlyMap<string, number>
): number | undefined => {
  let found: number | undefined;

  if (word.length >= MIN_MONTH_NAME_LENGTH) {
    for (const [name, month] of months) {
      if (name.startsWith(word) && (found === undefined || month < found)) {
        found = month;
      }
    }
  }

  return found;
};

/**
 * Splits a run of letters into known words, longest first. Scripts without spaces glue
 * words together: ja `日木曜日` is `日` + `木曜日`, he `בינו` is `ב` + `ינו`.
 */
const splitIntoKnownWords = (
  run: string,
  { ignored, months }: DateVocabulary
): readonly string[] | null => {
  const splits: (readonly string[] | null)[] = [[]];

  for (let end = 1; end <= run.length; end += 1) {
    splits.push(null);

    for (let start = 0; start < end; start += 1) {
      const head = splits[start];
      const word = run.slice(start, end);

      if (head && (months.has(word) || ignored.has(word))) {
        splits[end] = [...head, word];

        break;
      }
    }
  }

  return splits[run.length] ?? null;
};

/**
 * Exact words win over prefixes, so fr `mar.` (mardi) is a weekday, not `mars`. A typed
 * prefix of a month name (`sept`) still reads as that month; any other word makes the
 * text unreadable rather than letting the reference month fill in.
 */
const matchWord = (word: string, locale: string): WordMatch => {
  const vocabulary = dateVocabulary(locale);
  const exact = vocabulary.months.get(word);

  if (exact !== undefined) {
    return { kind: "month", month: exact };
  }

  if (vocabulary.ignored.has(word)) {
    return { kind: "ignored" };
  }

  const prefixed = matchMonthPrefix(word, vocabulary.months);

  if (prefixed !== undefined) {
    return { kind: "month", month: prefixed };
  }

  const split = splitIntoKnownWords(word, vocabulary);

  if (!split) {
    return { kind: "unknown" };
  }

  const month = split
    .map((part) => vocabulary.months.get(part))
    .find((candidate) => candidate !== undefined);

  return month === undefined ? { kind: "ignored" } : { kind: "month", month };
};

const expandYear = (year: number): number =>
  year < TWO_DIGIT_YEAR_LIMIT ? CENTURY + year : year;

/** A shorter entry drops the year first; a lone number is always the day. */
const resolveFilledSlots = (
  slots: readonly DateFieldName[],
  count: number
): readonly DateFieldName[] => {
  if (count === slots.length) {
    return slots;
  }

  if (count === 1) {
    return ["day"];
  }

  return slots.filter((field) => field !== "year").slice(0, count);
};

/** Assigns the typed numbers to date fields; a named month takes the month slot first. */
const readDateParts = (
  numbers: readonly number[],
  namedMonth: number | undefined,
  locale: string
): DateInputParts | null => {
  const slots =
    namedMonth === undefined
      ? dateFieldOrder(locale, "numeric")
      : dateFieldOrder(locale, "long").filter((field) => field !== "month");

  if (numbers.length === 0 || numbers.length > slots.length) {
    return null;
  }

  const filled = resolveFilledSlots(slots, numbers.length);

  const assigned = new Map<DateFieldName, number>(
    numbers.map((value, index) => [filled[index], value])
  );

  const day = assigned.get("day");

  if (day === undefined) {
    return null;
  }

  return {
    day,
    month: namedMonth ?? assigned.get("month"),
    year: assigned.get("year"),
  };
};

const buildDateInput = (
  year: number,
  month: number,
  day: number
): DateInputResult => {
  if (
    month < 1 ||
    month > MONTHS_PER_YEAR ||
    day < 1 ||
    day > MAX_DAY_OF_MONTH
  ) {
    return { kind: DATE_INPUT.invalid };
  }

  // Date.UTC maps years 0-99 onto 1900-1999; setUTCFullYear does not.
  const utc = new Date(Date.UTC(2000, 0, 1, 12));
  utc.setUTCFullYear(year, month - 1, day);

  // A rolled-over date (31 April, 30 February) lands on another month.
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return { kind: DATE_INPUT.invalid };
  }

  try {
    return {
      kind: DATE_INPUT.value,
      value: calendarDate(utc.toISOString().slice(0, 10)),
    };
  } catch {
    return { kind: DATE_INPUT.invalid };
  }
};

export const parseDateInput = (
  text: string,
  { locale, reference }: ParseDateInputOptions
): DateInputResult => {
  const normalised = toAsciiDigits(text).trim();

  if (!normalised) {
    return { kind: DATE_INPUT.empty };
  }

  const isoMatch = ISO_DATE_PATTERN.exec(normalised);

  if (isoMatch) {
    return buildDateInput(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const numbers: number[] = [];

  let namedMonth: number | undefined;

  for (const [token] of withoutAbbreviationDots(normalised).matchAll(
    DATE_TOKEN_PATTERN
  )) {
    if (DIGITS_ONLY_PATTERN.test(token)) {
      numbers.push(Number(token));

      continue;
    }

    const match = matchWord(token.toLowerCase(), locale);

    if (match.kind === "unknown") {
      return { kind: DATE_INPUT.invalid };
    }

    if (match.kind === "month") {
      namedMonth ??= match.month;
    }
  }

  const referenceYear = Number(reference.slice(0, 4));
  const referenceMonth = Number(reference.slice(5, 7));
  const parts = readDateParts(numbers, namedMonth, locale);

  if (!parts) {
    return { kind: DATE_INPUT.invalid };
  }

  return buildDateInput(
    expandYear(parts.year ?? referenceYear),
    parts.month ?? referenceMonth,
    parts.day
  );
};
