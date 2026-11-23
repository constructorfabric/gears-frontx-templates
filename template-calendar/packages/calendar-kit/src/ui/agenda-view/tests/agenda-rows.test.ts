import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect as assert, it } from "vitest";

import { allDayEvent, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, utcInstant } from "../../../core/model";
import { AGENDA_WINDOW_DAYS } from "../../../core/temporal";
import { useAgendaViewController } from "../../../react/controllers/use-agenda-view-controller";
import { buildAgendaModel, isRowAvailable } from "../agenda-rows";

describe("agenda rows", () => {
  it("groups each day's events in start order with all-day rows first", () => {
    const model = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        timedEvent(
          "later",
          "2026-08-24T10:00:00.000Z",
          "2026-08-24T11:00:00.000Z"
        ),
        allDayEvent("all-day", "2026-08-24", "2026-08-26"),
        timedEvent(
          "earlier",
          "2026-08-24T08:00:00.000Z",
          "2026-08-24T09:00:00.000Z"
        ),
      ],
      now: utcInstant("2026-08-24T09:00:00.000Z"),
      timeZone: UTC,
    });

    assert(model.dayGroups).toHaveLength(AGENDA_WINDOW_DAYS);
    assert(model.dayGroups[0]?.rows.map((row) => row.event.id)).toStrictEqual([
      "all-day",
      "earlier",
      "later",
    ]);
    assert(model.dayGroups[1]?.rows.map((row) => row.segment)).toStrictEqual([
      "end",
    ]);
    assert(model.eventRows.map((row) => row.focusIndex)).toStrictEqual([
      0, 1, 2, 3,
    ]);
  });

  it("lists an all-day row before a timed row that starts at the same instant", () => {
    const model = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        timedEvent(
          "midnight",
          "2026-08-24T00:00:00.000Z",
          "2026-08-24T01:00:00.000Z"
        ),
        allDayEvent("all-day", "2026-08-24", "2026-08-25"),
      ],
      now: utcInstant("2026-08-23T12:00:00.000Z"),
      timeZone: UTC,
    });

    assert(model.dayGroups[0]?.rows.map((row) => row.event.id)).toStrictEqual([
      "all-day",
      "midnight",
    ]);
  });

  it("places the now line before the first timed row that has not started", () => {
    const events = [
      timedEvent(
        "past",
        "2026-08-24T08:00:00.000Z",
        "2026-08-24T09:00:00.000Z"
      ),
      timedEvent(
        "next",
        "2026-08-24T10:00:00.000Z",
        "2026-08-24T11:00:00.000Z"
      ),
    ];

    const morning = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events,
      now: utcInstant("2026-08-24T09:30:00.000Z"),
      timeZone: UTC,
    });

    assert(morning.dayGroups[0]?.nowIndex).toBe(1);
    assert(morning.dayGroups[1]?.rows).toStrictEqual([]);

    const afternoon = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events,
      now: utcInstant("2026-08-24T12:00:00.000Z"),
      timeZone: UTC,
    });

    assert(afternoon.dayGroups[0]?.nowIndex).toBe(2);

    const otherDay = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events,
      now: utcInstant("2026-08-20T09:30:00.000Z"),
      timeZone: UTC,
    });

    assert(otherDay.dayGroups[0]?.nowIndex).toBeNull();

    const emptyToday = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [],
      now: utcInstant("2026-08-24T12:00:00.000Z"),
      timeZone: UTC,
    });

    assert(emptyToday.dayGroups[0]?.rows).toStrictEqual([]);
    assert(emptyToday.dayGroups[0]?.nowIndex).toBeNull();
  });

  it("rejects malformed intervals and unavailable rows", () => {
    assert(() =>
      buildAgendaModel({
        date: calendarDate("2026-08-24"),
        events: [
          timedEvent(
            "invalid",
            "2026-08-24T10:00:00.000Z",
            "2026-08-24T10:00:00.000Z"
          ),
        ],
        now: utcInstant("2026-08-24T09:00:00.000Z"),
        timeZone: UTC,
      })
    ).toThrow("must end after it starts");

    const [row] = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        timedEvent(
          "unavailable",
          "2026-08-24T10:00:00.000Z",
          "2026-08-24T11:00:00.000Z",
          false
        ),
      ],
      now: utcInstant("2026-08-24T09:00:00.000Z"),
      timeZone: UTC,
    }).eventRows;

    assert(row).toBeDefined();
    assert(isRowAvailable(row)).toBeFalsy();

    const [busyRow] = buildAgendaModel({
      date: calendarDate("2026-08-24"),
      events: [
        {
          ...timedEvent(
            "busy",
            "2026-08-24T10:00:00.000Z",
            "2026-08-24T11:00:00.000Z"
          ),
          access: "busy",
        },
      ],
      now: utcInstant("2026-08-24T09:00:00.000Z"),
      timeZone: UTC,
    }).eventRows;

    assert(busyRow).toBeDefined();
    assert(isRowAvailable(busyRow)).toBeFalsy();

    assert(() =>
      buildAgendaModel({
        date: calendarDate("2026-08-24"),
        events: [allDayEvent("invalid-day", "2026-08-24", "2026-08-24")],
        now: utcInstant("2026-08-24T09:00:00.000Z"),
        timeZone: UTC,
      })
    ).toThrow("must end after it starts");
  });

  it("reports invalid layout data and handles an empty focus sequence", async () => {
    const invalidEvent = timedEvent(
      "invalid",
      "2026-08-24T10:00:00.000Z",
      "2026-08-24T10:00:00.000Z"
    );

    const { result } = renderHook(() =>
      useAgendaViewController({
        date: calendarDate("2026-08-24"),
        events: [invalidEvent],
        timeZone: UTC,
      })
    );

    act(() => {
      result.current.focusRow(0);
    });
    assert(result.current.focusedRowIndex).toBe(-1);

    let escapeDefaultPrevented = true;
    render(
      createElement(
        "button",
        {
          onKeyDown: (event) => {
            result.current.handleRowKeyDown(event, 0, "missing");
            escapeDefaultPrevented = event.defaultPrevented;
          },
          type: "button",
        },
        "Escape target"
      )
    );
    const button = screen.getByRole("button");
    button.focus();
    const user = userEvent.setup();
    await user.keyboard("{Escape}");

    assert(escapeDefaultPrevented).toBeFalsy();
  });
});
