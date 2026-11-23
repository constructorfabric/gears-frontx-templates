import { describe, expect as assert, it, vi } from "vitest";

import {
  allDayEvent,
  timedEvent,
  englishMessage,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  fromViewerDateTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import {
  buildSearchGroups,
  countRows,
  eventMatches,
  formatSearchCount,
  formatSearchDayHeader,
  formatSearchResultDuration,
  isSearchResultNow,
  normalizeQuery,
  rowAt,
  viewerToday,
} from "../search-results-format";

const NOW = utcInstant("2026-08-24T08:00:00.000Z");

const requiredRow = <T>(row: T | undefined): T => {
  if (row === undefined) {
    throw new Error("Expected search group to carry a row");
  }

  return row;
};

describe("search-results-format", () => {
  it("normalizes query and searchable fields with trim, lowercase, and accent folding", () => {
    assert(normalizeQuery("  CAFÉ  ")).toBe("cafe");
    assert(
      eventMatches(
        timedEvent(
          "one",
          "Other",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00",
          {
            organizer: "Élodie",
          }
        ),
        "elodie"
      )
    ).toBeTruthy();
    assert(
      eventMatches(
        timedEvent(
          "two",
          "Other",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00"
        ),
        "missing"
      )
    ).toBeFalsy();
  });

  it.each([
    ["description", { description: "Bring the lab coat" }, "lab coat"],
    ["event type", { eventType: "Workshop" }, "workshop"],
    [
      "attendee name",
      { attendees: [{ displayName: "Ada Lovelace", id: "a" }] },
      "lovelace",
    ],
    [
      "attendee email",
      { attendees: [{ displayName: "Ada", email: "ada@x.org", id: "a" }] },
      "x.org",
    ],
  ])("matches an event by its %s", (_field, overrides, needle) => {
    const event = timedEvent({ id: "one", title: "Planning", ...overrides });

    assert(eventMatches(event, needle)).toBeTruthy();
    assert(
      eventMatches(timedEvent({ id: "two", title: "Planning" }), needle)
    ).toBeFalsy();
  });

  it("keeps only events on the chosen calendars", () => {
    const groups = buildSearchGroups(
      [
        timedEvent({ calendarId: "work", id: "a", title: "Review" }),
        timedEvent({ calendarId: "home", id: "b", title: "Review" }),
        timedEvent({ id: "c", title: "Review" }),
      ],
      "review",
      UTC,
      { calendarIds: ["work"] }
    );

    assert(
      groups.flatMap((group) => group.rows.map((row) => row.event.id))
    ).toStrictEqual(["a"]);
  });

  it("keeps only the days inside the range, ends included", () => {
    const groups = buildSearchGroups(
      [
        timedEvent("before", "Review", "2026-08-23", "09:00", "2026-08-23", "10:00"),
        timedEvent("first", "Review", "2026-08-24", "09:00", "2026-08-24", "10:00"),
        timedEvent("last", "Review", "2026-08-26", "09:00", "2026-08-26", "10:00"),
        timedEvent("after", "Review", "2026-08-27", "09:00", "2026-08-27", "10:00"),
      ],
      "review",
      UTC,
      {
        range: {
          end: calendarDate("2026-08-26"),
          start: calendarDate("2026-08-24"),
        },
      }
    );

    assert(
      groups.flatMap((group) => group.rows.map((row) => row.event.id))
    ).toStrictEqual(["first", "last"]);
  });

  it("returns no rows for a query shorter than the minimum", () => {
    assert(buildSearchGroups([], "x", UTC)).toStrictEqual([]);
  });

  it("splits timed events and expands all-day events across viewer days", () => {
    const groups = buildSearchGroups(
      [
        timedEvent(
          "overnight",
          "Overnight",
          "2026-08-24",
          "23:00",
          "2026-08-25",
          "01:00"
        ),
        allDayEvent("conference", "Conference", "2026-08-24", "2026-08-26"),
      ],
      "er",
      UTC
    );

    assert(groups).toHaveLength(2);
    assert(groups[0]?.date).toBe("2026-08-24");
    assert(groups[0]?.rows.map((row) => row.event.id)).toStrictEqual([
      "conference",
      "overnight",
    ]);
    assert(groups[1]?.rows.map((row) => row.event.id)).toStrictEqual([
      "conference",
      "overnight",
    ]);
    assert(groups[0]?.rows.map((row) => row.focusIndex)).toStrictEqual([0, 1]);
    assert(rowAt(groups, 3)?.event.id).toBe("overnight");
    assert(rowAt(groups, 99)).toBeUndefined();
  });

  it("orders rows by all-day first, then start, then title and counts them", () => {
    const groups = buildSearchGroups(
      [
        timedEvent(
          "late",
          "Zed Event",
          "2026-08-24",
          "11:00",
          "2026-08-24",
          "12:00"
        ),
        timedEvent(
          "early",
          "Beta Event",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00"
        ),
        timedEvent(
          "same",
          "Alpha Event",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00"
        ),
        allDayEvent("all-day", "All day Event", "2026-08-24", "2026-08-25"),
      ],
      "event",
      UTC
    );

    assert(groups[0]?.rows.map((row) => row.event.title)).toStrictEqual([
      "All day Event",
      "Alpha Event",
      "Beta Event",
      "Zed Event",
    ]);
    assert(countRows(groups)).toBe(4);
  });

  it("formats relative and absolute group headers and pluralized counts", () => {
    const today = viewerToday(NOW, UTC);
    const todayStart = fromViewerDateTime({
      date: today,
      time: "00:00",
      timeZone: UTC,
    });
    const tomorrow = calendarDate("2026-08-25");
    const tomorrowStart = fromViewerDateTime({
      date: tomorrow,
      time: "00:00",
      timeZone: UTC,
    });
    const later = calendarDate("2026-08-26");
    const laterStart = fromViewerDateTime({
      date: later,
      time: "00:00",
      timeZone: UTC,
    });

    assert(
      formatSearchDayHeader(today, todayStart, today, UTC, "en-US", t)
    ).toBe("Today");
    assert(
      formatSearchDayHeader(tomorrow, tomorrowStart, today, UTC, "en-US", t)
    ).toBe("Tomorrow");
    assert(
      formatSearchDayHeader(later, laterStart, today, UTC, "en-US", t)
    ).toBe("Wed, Aug 26");
    const nextYear = calendarDate("2027-01-06");
    const nextYearStart = fromViewerDateTime({
      date: nextYear,
      time: "00:00",
      timeZone: UTC,
    });
    assert(
      formatSearchDayHeader(nextYear, nextYearStart, today, UTC, "en-US", t)
    ).toBe("Wed, Jan 6, 2027");
    assert(formatSearchCount(1, englishMessage("en-US"))).toBe("1 result");
    assert(formatSearchCount(2, englishMessage("en-US"))).toBe("2 results");
  });
});

describe(formatSearchCount, () => {
  it("passes the numeric count so the resolver selects the category", () => {
    const message = vi.fn<CalendarTranslate>(() => "count");

    assert(formatSearchCount(2, message)).toBe("count");
    assert(message).toHaveBeenCalledWith("calendar.panel.searchCount", {
      count: 2,
    });
  });
});

const timedRow = (start: string, end: string) =>
  requiredRow(
    buildSearchGroups(
      [timedEvent("row", "Row", "2026-08-24", start, "2026-08-24", end)],
      "row",
      UTC
    )[0]?.rows[0]
  );

describe(isSearchResultNow, () => {
  it("is true from the start up to but excluding the end", () => {
    const row = timedRow("09:00", "10:00");

    assert(isSearchResultNow(row, utcInstant("2026-08-24T08:59:00.000Z"))).toBe(
      false
    );
    assert(isSearchResultNow(row, utcInstant("2026-08-24T09:00:00.000Z"))).toBe(
      true
    );
    assert(isSearchResultNow(row, utcInstant("2026-08-24T09:59:00.000Z"))).toBe(
      true
    );
    assert(isSearchResultNow(row, utcInstant("2026-08-24T10:00:00.000Z"))).toBe(
      false
    );
  });

  it("is never true for an all-day row", () => {
    const [group] = buildSearchGroups(
      [allDayEvent("all-day", "All day", "2026-08-24", "2026-08-25")],
      "all",
      UTC
    );

    assert(isSearchResultNow(requiredRow(group?.rows[0]), NOW)).toBe(false);
  });
});

describe(formatSearchResultDuration, () => {
  it("formats the row length with the kit duration format", () => {
    assert(formatSearchResultDuration(timedRow("09:00", "10:30"), "en-US")).toBe(
      "1 hr\u202f30 min"
    );
  });

  it("returns null for zero-length and all-day rows", () => {
    const row = timedRow("09:00", "10:00");

    assert(
      formatSearchResultDuration({ ...row, end: row.start }, "en-US")
    ).toBeNull();

    const [group] = buildSearchGroups(
      [allDayEvent("all-day", "All day", "2026-08-24", "2026-08-25")],
      "all",
      UTC
    );

    assert(formatSearchResultDuration(requiredRow(group?.rows[0]), "en-US")).toBeNull();
  });
});
