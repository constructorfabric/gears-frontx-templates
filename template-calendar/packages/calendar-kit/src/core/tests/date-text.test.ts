import { describe, expect as assert, it } from "vitest";

import { DATE_INPUT, parseDateInput } from "../date-text";
import type { DateInputResult } from "../date-text";
import { formatViewerDate } from "../format";
import { calendarDate, parseIanaTimeZone, utcInstant } from "../model";

describe("calendar date-text parsing", () => {
  const REFERENCE_DATE = calendarDate("2026-08-24");

  const parse = (text: string, locale = "en-US"): DateInputResult =>
    parseDateInput(text, { locale, reference: REFERENCE_DATE });

  it("reports empty input for blank text", () => {
    assert(parse("")).toStrictEqual({ kind: DATE_INPUT.empty });
    assert(parse("   ")).toStrictEqual({ kind: DATE_INPUT.empty });
  });

  it("accepts an ISO date in any locale", () => {
    assert(parse("2026-09-22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("2026-09-22", "de-DE")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("reads numeric input in the order the locale writes it", () => {
    assert(parse("9/22/2026")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22.9.2026", "de-DE")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22/9/2026", "en-GB")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("fills the missing parts from the reference date", () => {
    assert(parse("22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-08-22",
    });
    assert(parse("9/22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22/9", "en-GB")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("expands a two-digit year into the current century", () => {
    assert(parse("9/22/26")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("reads month names in the display format it renders", () => {
    assert(parse("Tue, Sep 22")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("September 22, 2027")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2027-09-22",
    });
    assert(parse("22. Sept. 2026", "de-DE")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("normalises localized digits", () => {
    assert(parse("٢٠٢٦-٠٩-٢٢", "ar-EG")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("keeps ISO years below 100 as written", () => {
    assert(parse("0050-03-01")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "0050-03-01",
    });
  });

  it("matches Gregorian month names only, not the locale's own calendar", () => {
    assert(parse("5 مارس", "fa")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-03-05",
    });
    assert(parse("5 اسفند", "fa")).not.toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-03-05",
    });
  });

  it("reads the format-form month names a date is written with", () => {
    assert(parse("5 марта", "ru")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-03-05",
    });
    assert(parse("22 сентября 2026", "ru")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
    assert(parse("22 września 2026", "pl")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("skips weekday names instead of reading them as a month", () => {
    assert(parse("mar. 22 sept.", "fr")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-09-22",
    });
  });

  it("reads dates written with CJK unit suffixes", () => {
    assert(parse("2026年3月5日", "ja")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-03-05",
    });
    assert(parse("3月5日", "zh-CN")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-03-05",
    });
    assert(parse("5日", "ja")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-08-05",
    });
    assert(parse("2026년 3월 5일", "ko")).toStrictEqual({
      kind: DATE_INPUT.value,
      value: "2026-03-05",
    });
  });

  it("rejects a word that is not a month the locale knows", () => {
    assert(parse("Mrach 5")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("5 мрта", "ru")).toStrictEqual({ kind: DATE_INPUT.invalid });
  });

  it.each([
    "en-US",
    "en-GB",
    "de-DE",
    "fr-FR",
    "es-ES",
    "ca-ES",
    "pt-BR",
    "ru-RU",
    "pl-PL",
    "uk-UA",
    "tr-TR",
    "vi-VN",
    "ja-JP",
    "zh-CN",
    "zh-TW",
    "ko-KR",
    "ar-EG",
    "fa-IR",
    "he-IL",
    "hi-IN",
    "th-TH",
  ])("reads back what formatViewerDate writes in %s", (locale) => {
    const timeZone = parseIanaTimeZone("UTC");

    for (let month = 1; month <= 12; month += 1) {
      const date = `2026-${String(month).padStart(2, "0")}-22`;
      const instant = utcInstant(`${date}T12:00:00.000Z`);

      for (const dateStyle of ["short", "medium", "long", "full"] as const) {
        const text = formatViewerDate(instant, timeZone, locale, { dateStyle });

        assert(
          parseDateInput(text, {
            locale,
            reference: calendarDate("2020-01-01"),
          }),
          `${dateStyle}: ${text}`
        ).toStrictEqual({ kind: DATE_INPUT.value, value: date });
      }
    }
  });

  it("rejects impossible and unreadable dates", () => {
    assert(parse("Feb 30")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("13/40/2026")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("hello")).toStrictEqual({ kind: DATE_INPUT.invalid });
    assert(parse("0/0/0")).toStrictEqual({ kind: DATE_INPUT.invalid });
  });
});
