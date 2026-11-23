import { describe, expect, it, vi } from "vitest";

import { englishMessage, UTC } from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarEvent } from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import {
  formatComparisonLine,
  formatEventRange,
  formatRecurrenceSummary,
  formatAttendanceSummary,
  guestCount,
} from "../event-detail-panel-format";
import { englishTranslate } from "../../../i18n/english";

const BERLIN = parseIanaTimeZone("Europe/Berlin");
const DATE = calendarDate("2026-08-24");

type TimedEvent = Extract<CalendarEvent, { readonly allDay: false }>;

type TimedEventOverrides = Partial<Omit<TimedEvent, "allDay">>;

const makeTimedEvent = (overrides: TimedEventOverrides = {}): TimedEvent => ({
  allDay: false,
  available: true,
  colorFamily: "purple",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "event-1",
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Planning",
  ...overrides,
});

const makeAllDayEvent = (endDate: string): CalendarEvent => ({
  allDay: true,
  available: true,
  colorFamily: "orange",
  endDate: calendarDate(endDate),
  endTime: null,
  id: "event-all-day",
  startDate: DATE,
  startTime: null,
  timeZone: UTC,
  title: "Holiday",
});

describe(formatEventRange, () => {
  it("formats a timed event as date plus clock range in the viewer zone", () => {
    expect(formatEventRange(makeTimedEvent(), UTC, "en-US")).toBe(
      "Aug 24, 2026, 09:00 – 10:00"
    );
  });

  it("shows the clock times in the viewer zone, not the event zone", () => {
    expect(formatEventRange(makeTimedEvent(), BERLIN, "en-US")).toBe(
      "Aug 24, 2026, 11:00 – 12:00"
    );
  });

  it("dates a recurring occurrence on its own day, not the series start", () => {
    const occurrence = makeTimedEvent({
      end: utcInstant("2026-08-31T10:00:00.000Z"),
      start: utcInstant("2026-08-31T09:00:00.000Z"),
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });

    expect(formatEventRange(occurrence, UTC, "en-US")).toBe(
      "Aug 31, 2026, 09:00 – 10:00"
    );
  });

  it("omits the end clock when the event has no end time", () => {
    expect(
      formatEventRange(makeTimedEvent({ endTime: null }), UTC, "en-US")
    ).toBe("Aug 24, 2026, 09:00");
  });

  it("keeps the date and clock range in the viewer zone when the event has its own zone", () => {
    const sofia = parseIanaTimeZone("Europe/Sofia");
    const overnight = makeTimedEvent({
      end: utcInstant("2026-11-10T00:00:00.000Z"),
      endDate: calendarDate("2026-11-10"),
      endTime: parseLocalTime("01:00"),
      start: utcInstant("2026-11-09T22:00:00.000Z"),
      startDate: calendarDate("2026-11-09"),
      startTime: parseLocalTime("23:00"),
      timeZone: BERLIN,
    });

    expect(formatEventRange(overnight, sofia, "en-US")).toBe(
      "Nov 10, 2026, 00:00 – 02:00"
    );
  });

  it("formats a single all-day event as one date", () => {
    expect(formatEventRange(makeAllDayEvent("2026-08-25"), UTC, "en-US")).toBe(
      "Aug 24, 2026"
    );
  });

  it("formats a multi-day all-day event as an inclusive date range", () => {
    expect(formatEventRange(makeAllDayEvent("2026-08-26"), UTC, "en-US")).toBe(
      "Aug 24, 2026 – Aug 25, 2026"
    );
  });
});

describe(formatComparisonLine, () => {
  it("converts the event clock into the comparison zone and names it", () => {
    expect(formatComparisonLine(makeTimedEvent(), BERLIN, "en-US")).toBe(
      "11:00 AM – 12:00 PM (Europe/Berlin)"
    );
  });

  it("shows only the converted start clock without an end time", () => {
    expect(
      formatComparisonLine(makeTimedEvent({ endTime: null }), BERLIN, "en-US")
    ).toBe("11:00 AM (Europe/Berlin)");
  });

  it("converts an all-day event into the comparison zone date", () => {
    expect(
      formatComparisonLine(makeAllDayEvent("2026-08-25"), BERLIN, "en-US")
    ).toBe("Aug 24, 2026 (Europe/Berlin)");
  });
});

describe(formatAttendanceSummary, () => {
  it("lists the invited count, then the responses given, in the design's order", () => {
    expect(
      formatAttendanceSummary(
        makeTimedEvent({
          rsvp: { awaiting: 8, invited: 31, maybe: 3, no: 3, yes: 17 },
        }),
        englishMessage("en-US")
      )
    ).toBe("31 invited · 17 yes · 3 no · 8 awaiting · 3 maybe");
  });

  it("leaves zero response counts out of the line", () => {
    expect(
      formatAttendanceSummary(
        makeTimedEvent({
          rsvp: { awaiting: 0, invited: 2, maybe: 0, no: 0, yes: 1 },
        }),
        englishMessage("en-US")
      )
    ).toBe("2 invited · 1 yes");
  });

  it("formats counts in the active locale", () => {
    expect(
      formatAttendanceSummary(
        makeTimedEvent({
          rsvp: { awaiting: 0, invited: 2, maybe: 0, no: 0, yes: 2 },
        }),
        englishMessage("ar-EG")
      )
    ).toBe("٢ invited · ٢ yes");
  });

  it("passes the raw count to each key", () => {
    const message = vi.fn<CalendarTranslate>(() => "count");

    formatAttendanceSummary(
      makeTimedEvent({ rsvp: { awaiting: 0, invited: 31, maybe: 3, no: 0, yes: 0 } }),
      message
    );

    expect(message).toHaveBeenCalledWith("calendar.detail.invited", { count: 31 });
    expect(message).toHaveBeenCalledWith("calendar.detail.rsvp.maybe", { count: 3 });
  });
});

describe(guestCount, () => {
  it("prefers the RSVP total and falls back to the attendee list", () => {
    expect(
      guestCount(
        makeTimedEvent({
          rsvp: { awaiting: 0, invited: 9, maybe: 0, no: 0, yes: 9 },
        })
      )
    ).toBe(9);
    expect(
      guestCount(
        makeTimedEvent({ attendees: [{ displayName: "Ada", id: "ada" }] })
      )
    ).toBe(1);
    expect(guestCount(makeTimedEvent())).toBe(0);
  });
});

describe(formatRecurrenceSummary, () => {
  it("describes a rule it reads in words, as the create form does", () => {
    const summary = (recurrenceRule: string): string | undefined =>
      formatRecurrenceSummary(
        makeTimedEvent({ recurrenceRule }),
        englishTranslate,
        "en-US"
      );

    expect(summary("FREQ=WEEKLY;BYDAY=MO,WE")).toBe(
      "Repeats every week on Monday and Wednesday"
    );
    expect(summary("FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=TU")).toBe(
      "Repeats every 2 weeks on Tuesday"
    );
    expect(summary("FREQ=DAILY")).toBe("Repeats every day");
    expect(summary("FREQ=YEARLY")).toMatch(/^Repeats every year on /u);
  });

  it("says a saved rule's end in words, so no raw rule part reaches the detail", () => {
    const summary = (recurrenceRule: string): string | undefined =>
      formatRecurrenceSummary(
        makeTimedEvent({ recurrenceRule }),
        englishTranslate,
        "en-US"
      );

    expect(summary("FREQ=WEEKLY;WKST=MO;BYDAY=MO;COUNT=12")).toBe(
      "Repeats every week on Monday, 12 times"
    );
    expect(summary("FREQ=DAILY;COUNT=1")).toBe("Repeats every day, 1 time");
    expect(summary("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261201T000000Z")).toMatch(
      /^Repeats every week on Monday until /u
    );
  });

  it("shows the host's summary in place of the rule, and the kit's own text without one", () => {
    const t = vi.fn<CalendarTranslate>(
      (_key, values) => `Repeats ${String(values?.rule)}`
    );

    expect(
      formatRecurrenceSummary(
        makeTimedEvent({
          recurrenceRule: "FREQ=WEEKLY;WKST=MO;BYDAY=MO;COUNT=12",
          recurrenceSummary: "Repeats every week on Monday for 12 occurrences",
        }),
        t,
        "en-US"
      )
    ).toBe("Repeats every week on Monday for 12 occurrences");
    expect(t).not.toHaveBeenCalled();

    expect(
      formatRecurrenceSummary(
        makeTimedEvent({ recurrenceRule: "FREQ=WEEKLY;BYMONTHDAY=1", recurrenceSummary: "  " }),
        t,
        "en-US"
      )
    ).toBe("Repeats FREQ=WEEKLY;BYMONTHDAY=1");
  });

  it("hands a rule it cannot read to the consumer translation", () => {
    const t = vi.fn<CalendarTranslate>(() => "Repeats on day 1");

    const summary = formatRecurrenceSummary(
      makeTimedEvent({ recurrenceRule: "FREQ=WEEKLY;BYMONTHDAY=1" }),
      t,
      "en-US"
    );

    expect(summary).toBe("Repeats on day 1");
    expect(t).toHaveBeenCalledWith("calendar.detail.recurrence", {
      rule: "FREQ=WEEKLY;BYMONTHDAY=1",
    });
  });

  it("keeps the raw rule for a frequency the summary does not describe", () => {
    const t = vi.fn<CalendarTranslate>(
      (_key, values) => `Repeats ${String(values?.rule)}`
    );

    expect(
      formatRecurrenceSummary(
        makeTimedEvent({ recurrenceRule: "FREQ=HOURLY;INTERVAL=2" }),
        t,
        "en-US"
      )
    ).toBe("Repeats FREQ=HOURLY;INTERVAL=2");
    expect(
      formatRecurrenceSummary(
        makeTimedEvent({ recurrenceRule: "FREQ=MINUTELY" }),
        t,
        "en-US"
      )
    ).toBe("Repeats FREQ=MINUTELY");
  });

  it("yields no summary for missing, empty, or blank rules", () => {
    const t = vi.fn<CalendarTranslate>(() => "Repeats weekly");

    expect(formatRecurrenceSummary(makeTimedEvent(), t, "en-US")).toBeUndefined();
    expect(
      formatRecurrenceSummary(makeTimedEvent({ recurrenceRule: null }), t, "en-US")
    ).toBeUndefined();
    expect(
      formatRecurrenceSummary(makeTimedEvent({ recurrenceRule: "" }), t, "en-US")
    ).toBeUndefined();
    expect(
      formatRecurrenceSummary(makeTimedEvent({ recurrenceRule: "   " }), t, "en-US")
    ).toBeUndefined();
    expect(t).not.toHaveBeenCalled();
  });
});
