import { expect, it, vi } from "vitest";
import { formatViewerTimeZoneOffset } from "../format";
import { parseIanaTimeZone, utcInstant } from "../model";

it.each([
  ["en-US", "GMT", "GMT+0"],
  ["fr-FR", "UTC", "UTC+0"],
  ["ar-EG", "غرينتش", "غرينتش+٠"],
  ["fa-IR", "گرینویچ", "\u200e+۰ گرینویچ"],
])("normalizes zero offset in %s with older ICU output", (locale, oldLabel, expected) => {
  const original = Intl.DateTimeFormat.prototype.formatToParts;
  const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
  spy.mockImplementation(function (this: Intl.DateTimeFormat, ...args) {
    const parts = original.apply(this, args);
    const options = this.resolvedOptions();
    if (options.timeZone === "UTC" && options.timeZoneName === "shortOffset") {
      return parts.map((part) =>
        part.type === "timeZoneName" ? { ...part, value: oldLabel } : part
      );
    }
    return parts;
  });

  try {
    expect(
      formatViewerTimeZoneOffset(
        utcInstant("2026-08-24T10:00:00.000Z"),
        parseIanaTimeZone("UTC"),
        locale
      )
    ).toBe(expected);
  } finally {
    spy.mockRestore();
  }
});
