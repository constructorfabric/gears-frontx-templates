import { describe, expect as assert, it } from "vitest";

import {
  englishMessage,
  timedEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import { calendarDate, utcInstant } from "../../../core/model";
import {
  buildLiveAnnouncement,
  formatAgendaDate,
  formatAgendaEventCount,
  getRelativeDayLabel,
} from "../agenda-format";
import { buildAgendaModel } from "../agenda-rows";

describe("agenda formatting", () => {
  it("formats dates, plural counts, and relative day labels", () => {
    const t = englishMessage("en-US");

    assert(
      formatAgendaDate(utcInstant("2025-09-01T12:00:00.000Z"), UTC, "en-US")
    ).toBe("Mon, Sep 1");
    assert(formatAgendaEventCount(1, t)).toBe("1 event");
    assert(formatAgendaEventCount(2, t)).toBe("2 events");
    assert(
      getRelativeDayLabel(
        calendarDate("2026-08-24"),
        calendarDate("2026-08-24"),
        t
      )
    ).toBe("Today");
    assert(
      getRelativeDayLabel(
        calendarDate("2026-08-25"),
        calendarDate("2026-08-24"),
        t
      )
    ).toBe("Tomorrow");
    assert(
      getRelativeDayLabel(
        calendarDate("2026-08-26"),
        calendarDate("2026-08-24"),
        t
      )
    ).toBeNull();
  });

  it("announces the date range and the count of each day with events", () => {
    const { dayGroups, eventRows, windowRange } = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        timedEvent(
          "first",
          "2026-08-24T09:00:00.000Z",
          "2026-08-24T10:00:00.000Z"
        ),
        timedEvent(
          "second",
          "2026-08-25T09:00:00.000Z",
          "2026-08-25T10:00:00.000Z"
        ),
        timedEvent(
          "third",
          "2026-08-25T11:00:00.000Z",
          "2026-08-25T12:00:00.000Z"
        ),
      ],
      now: utcInstant("2026-08-24T08:00:00.000Z"),
      timeZone: UTC,
    });

    const text = buildLiveAnnouncement(
      { kind: "range" },
      windowRange,
      dayGroups,
      eventRows,
      "en-US",
      UTC,
      englishMessage("en-US")
    );

    assert(text).toContain("Mon, Aug 24 – Tue, Sep 22");
    assert(text).toContain("1 event");
    assert(text).toContain("2 events");
    assert(text).not.toContain("0 events");
  });

  it("announces the visible range alone when no day has events", () => {
    const { dayGroups, eventRows, windowRange } = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [],
      now: utcInstant("2026-08-24T08:00:00.000Z"),
      timeZone: UTC,
    });

    assert(
      buildLiveAnnouncement(
        { kind: "range" },
        windowRange,
        dayGroups,
        eventRows,
        "en-US",
        UTC,
        englishMessage("en-US")
      )
    ).toBe("Mon, Aug 24 – Tue, Sep 22");
  });

  it("rejects empty locales before constructing Intl formatters", () => {
    assert(() =>
      formatAgendaDate(utcInstant("2025-09-01T12:00:00.000Z"), UTC, " ")
    ).toThrow("Locale must not be empty");
  });
});
