import { describe, expect as assert, it } from "vitest";

import { UTC } from "../../__test-utils__/fixtures";
import {
  buildSelectionRange,
  createInteractionState,
  transitionInteraction,
  validateInteractionEvent,
} from "../interactions";
import {
  addCalendarDays,
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../model";
import type {
  CalendarCell,
  CalendarEvent,
  WeekGridInteractionMode,
} from "../model";
import type { InteractionAction, InteractionState } from "../interactions";

const cell = (
  date: string,
  startTime: string,
  endTime = `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`
): CalendarCell => {
  const startDate = calendarDate(date);

  const endDate =
    endTime <= startTime ? addCalendarDays(startDate, 1) : startDate;

  return {
    date: startDate,
    end: fromViewerDateTime({ date: endDate, time: endTime, timeZone: UTC }),
    endTime: parseLocalTime(endTime),
    start: fromViewerDateTime({
      date: startDate,
      time: startTime,
      timeZone: UTC,
    }),
    startTime: parseLocalTime(startTime),
  };
};

const first = cell("2026-08-24", "09:00");

const second = cell("2026-08-24", "10:00");

const third = cell("2026-08-24", "11:00");

const fourth = cell("2026-08-24", "12:00");

const run = (
  state: InteractionState,
  ...actions: readonly InteractionAction[]
): InteractionState => actions.reduce(transitionInteraction, state);

const event: CalendarEvent = {
  allDay: false,
  colorFamily: "turquoise",
  end: first.end,
  endDate: first.date,
  endTime: first.endTime,
  id: "event-1",
  start: first.start,
  startDate: first.date,
  startTime: first.startTime,
  timeZone: UTC,
  title: "Move me",
};

describe("core interaction state machine", () => {
  it.each<WeekGridInteractionMode>([
    "quick-create",
    "paint-and-move",
    "read-only",
  ])(
    "creates a state for the %s mode without inferring permissions from events",
    (mode) => {
      const state = createInteractionState(mode);
      assert(state.mode).toBe(mode);
      assert(state.paint).toBeNull();
      assert(state.pendingMove).toBeNull();
    }
  );

  it("rejects an invalid interaction mode at the core boundary", () => {
    assert(() =>
      (() => {
        const value = { mode: "quick-create" as const };
        Object.defineProperty(value, "mode", { value: "edit-anything" });

        return createInteractionState(value.mode);
      })()
    ).toThrow(RangeError);
  });

  it("paints a range in chronological cell order even when pointer travel is reversed", () => {
    const state = createInteractionState("paint-and-move");
    const started = transitionInteraction(state, {
      cell: third,
      type: "paint-start",
    });
    const updated = transitionInteraction(started, {
      cell: first,
      type: "paint-update",
    });
    const finished = transitionInteraction(updated, { type: "paint-end" });

    assert(finished.paint).toStrictEqual({
      cells: [first, second, third],
      end: third,
      start: first,
    });
  });

  it("does not emit a paint result from read-only mode", () => {
    const state = createInteractionState("read-only");
    const started = transitionInteraction(state, {
      cell: first,
      type: "paint-start",
    });
    const finished = transitionInteraction(started, { type: "paint-end" });

    assert(finished.paint).toBeNull();
    assert(finished.pendingMove).toBeNull();
  });

  it("keeps a move pending from its drop until confirm and makes cancel discard it", () => {
    const state = createInteractionState("paint-and-move");
    const dragging = run(
      state,
      { event, from: first, type: "move-start" },
      { to: second, type: "move-target" }
    );
    const move = { event, from: first, to: second };

    assert(dragging.drag).toStrictEqual(move);
    assert(dragging.pendingMove).toBeNull();

    const requested = run(dragging, { type: "move-drop" });

    assert(requested.drag).toBeNull();
    assert(requested.pendingMove).toStrictEqual(move);
    assert(requested.committedMove).toBeNull();

    const canceled = run(requested, { move, type: "move-cancel" });

    assert(canceled.pendingMove).toBeNull();
    assert(canceled.committedMove).toBeNull();

    const confirmed = run(requested, { move, type: "move-confirm" });

    assert(confirmed.pendingMove).toBeNull();
    assert(confirmed.committedMove).toStrictEqual(move);
  });

  it("does not request a move dropped on its origin", () => {
    const dropped = run(
      createInteractionState("paint-and-move"),
      { event, from: first, type: "move-start" },
      { type: "move-drop" }
    );
    const move = { event, from: first, to: first };

    assert(dropped.drag).toBeNull();
    assert(dropped.pendingMove).toBeNull();
    assert(
      run(dropped, { move, type: "move-confirm" }).committedMove
    ).toBeNull();
  });

  it("keeps a drag that passes back over its origin", () => {
    const confirmed = run(
      createInteractionState("paint-and-move"),
      { event, from: first, type: "move-start" },
      { to: second, type: "move-target" },
      { to: first, type: "move-target" },
      { type: "move-target" },
      { to: fourth, type: "move-target" },
      { type: "move-drop" },
      { move: { event, from: first, to: fourth }, type: "move-confirm" }
    );

    assert(confirmed.committedMove).toStrictEqual({
      event,
      from: first,
      to: fourth,
    });
  });

  it("starts no paint or move while a move waits for the host", () => {
    const other = { ...event, id: "event-2" };
    const moveA = { event, from: first, to: second };
    const pending = run(
      createInteractionState("paint-and-move"),
      { event, from: first, type: "move-start" },
      { to: second, type: "move-target" },
      { type: "move-drop" }
    );

    const draggedB = run(
      pending,
      { event: other, from: third, type: "move-start" },
      { to: fourth, type: "move-target" },
      { type: "move-drop" }
    );

    assert(draggedB).toStrictEqual(pending);
    assert(run(pending, { cell: third, type: "paint-start" })).toStrictEqual(
      pending
    );
    assert(
      run(pending, {
        move: { event: other, from: third, to: fourth },
        type: "move-confirm",
      })
    ).toStrictEqual(pending);
    assert(
      run(pending, { move: moveA, type: "move-confirm" }).committedMove
    ).toStrictEqual(moveA);
  });

  it("clears the last committed move when the next paint or move starts", () => {
    const committed = run(
      createInteractionState("paint-and-move"),
      { event, from: first, type: "move-start" },
      { to: second, type: "move-target" },
      { type: "move-drop" },
      { move: { event, from: first, to: second }, type: "move-confirm" }
    );

    assert(committed.committedMove).not.toBeNull();
    assert(
      transitionInteraction(committed, { cell: third, type: "paint-start" })
        .committedMove
    ).toBeNull();
    assert(
      transitionInteraction(committed, { event, from: second, type: "move-start" })
        .committedMove
    ).toBeNull();
  });

  it("labels inferred cells from their instants across a spring-forward gap", () => {
    const zone = parseIanaTimeZone("America/New_York");
    const date = calendarDate("2026-03-08");
    const zonedCell = (startTime: string, endTime: string): CalendarCell => ({
      date,
      end: fromViewerDateTime({ date, time: endTime, timeZone: zone }),
      endTime: parseLocalTime(endTime),
      start: fromViewerDateTime({ date, time: startTime, timeZone: zone }),
      startTime: parseLocalTime(startTime),
    });

    // 02:00 does not exist that day, so the cell after 01:00 starts at 03:00.
    const range = buildSelectionRange(
      zonedCell("01:00", "02:00"),
      zonedCell("04:00", "05:00"),
      zone
    );

    assert(
      range?.cells.map((item) => [item.startTime, item.endTime])
    ).toStrictEqual([
      ["01:00", "02:00"],
      ["03:00", "04:00"],
      ["04:00", "05:00"],
    ]);
  });

  it("rejects move and paint actions in quick-create mode", () => {
    const state = createInteractionState("quick-create");
    const painted = transitionInteraction(state, {
      cell: first,
      type: "paint-start",
    });
    const moved = transitionInteraction(painted, {
      event,
      from: first,
      type: "move-start",
    });

    assert(painted.paint).toBeNull();
    assert(moved.pendingMove).toBeNull();
  });

  it("ignores malformed or missing targets instead of creating an inverted range", () => {
    const state = createInteractionState("paint-and-move");

    const malformedCell = { ...third };
    Object.defineProperty(malformedCell, "start", { value: "not-utc" });
    // A paint must be under way, or the update returns before it reads the cell.
    const painting = transitionInteraction(state, {
      cell: first,
      type: "paint-start",
    });
    const malformed = transitionInteraction(painting, {
      cell: malformedCell,
      type: "paint-update",
    });

    const missingTarget = transitionInteraction(
      transitionInteraction(state, { event, from: first, type: "move-start" }),
      { to: undefined, type: "move-target" }
    );

    assert(painting.paint).not.toBeNull();
    assert(malformed.paint).toStrictEqual(painting.paint);
    assert(missingTarget.drag?.to).toStrictEqual(first);
    assert(missingTarget.pendingMove).toBeNull();
  });
});

describe("additional calendar interaction contracts", () => {
  it("paints a chronological range, clears its anchor, and ignores inactive modes", () => {
    const started = transitionInteraction(
      createInteractionState("paint-and-move"),
      {
        cell: third,
        type: "paint-start",
      }
    );

    const updated = transitionInteraction(started, {
      cell: first,
      type: "paint-update",
    });
    const finished = transitionInteraction(updated, { type: "paint-end" });

    assert(finished.paint).toStrictEqual({
      cells: [first, second, third],
      end: third,
      start: first,
    });
    assert(finished.paintAnchor).toBeNull();
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        cell: first,
        type: "paint-update",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("quick-create"), {
        cell: first,
        type: "paint-start",
      }).paint
    ).toBeNull();
    assert(
      transitionInteraction(createInteractionState("read-only"), {
        type: "paint-end",
      }).paintAnchor
    ).toBeNull();
  });

  it("rejects malformed cells and preserves a valid single-cell selection", () => {
    assert(buildSelectionRange(first, first)).toStrictEqual({
      cells: [first],
      end: first,
      start: first,
    });
    const malformed = { ...first };
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });
    assert(buildSelectionRange(malformed, third)).toBeNull();
    assert(buildSelectionRange(first, malformed)).toBeNull();
  });

  it("ignores confirm and cancel for another move or with nothing pending", () => {
    const initial = createInteractionState("paint-and-move");
    const move = { event, from: first, to: second };
    const dragging = run(
      initial,
      { event, from: first, type: "move-start" },
      { to: second, type: "move-target" }
    );

    assert(run(dragging, { move, type: "move-confirm" })).toStrictEqual(
      dragging
    );
    assert(run(dragging, { move, type: "move-cancel" }).drag).toBeNull();
    assert(
      run(dragging, { move: { ...move, to: third }, type: "move-cancel" })
    ).toStrictEqual(dragging);
    assert(run(initial, { move, type: "move-cancel" })).toStrictEqual(initial);
    assert(run(initial, { move, type: "move-confirm" })).toStrictEqual(initial);
    assert(run(initial, { type: "move-drop" })).toStrictEqual(initial);
  });

  it("does not move unavailable or unidentified events and does not permit moves outside the mode", () => {
    const unavailable = { ...event, available: false };

    const missingId = { ...event, id: "   " };

    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: unavailable,
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: missingId,
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("quick-create"), {
        event,
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("quick-create"));
  });

  it("handles an overnight cell and a repeated DST-hour cell without inventing wall time", () => {
    const overnight = cell("2026-08-24", "23:00", "00:00");
    assert(buildSelectionRange(overnight, overnight)?.cells).toStrictEqual([
      overnight,
    ]);

    const zone = parseIanaTimeZone("America/New_York");

    const repeated: CalendarCell = {
      date: calendarDate("2026-11-01"),
      end: fromViewerDateTime({
        date: calendarDate("2026-11-01"),
        disambiguation: "later",
        time: "01:30",
        timeZone: zone,
      }),
      endTime: parseLocalTime("01:30"),
      start: fromViewerDateTime({
        date: calendarDate("2026-11-01"),
        disambiguation: "earlier",
        time: "01:30",
        timeZone: zone,
      }),
      startTime: parseLocalTime("01:30"),
    };

    const later = {
      ...repeated,
      end: fromViewerDateTime({
        date: repeated.date,
        time: "03:30",
        timeZone: zone,
      }),
      endTime: parseLocalTime("03:30"),
      start: fromViewerDateTime({
        date: repeated.date,
        time: "02:30",
        timeZone: zone,
      }),
      startTime: parseLocalTime("02:30"),
    };

    const repeatedSelection = buildSelectionRange(repeated, later);

    assert(repeatedSelection?.cells).toHaveLength(3);
    assert(repeatedSelection?.cells.at(-1)).toStrictEqual(later);
  });

  it("bounds pathological inferred ranges while retaining the requested endpoint", () => {
    const short = cell("2026-08-24", "09:00", "09:01");

    const far = {
      ...short,
      date: calendarDate("2040-01-01"),
      end: utcInstant("2040-01-01T00:01:00.000Z"),
      start: utcInstant("2040-01-01T00:00:00.000Z"),
    };

    const result = buildSelectionRange(short, far);

    assert(result?.cells.at(-1)).toStrictEqual(far);
    assert(result?.cells.length).toBeGreaterThan(0);
  });

  it("returns typed rejection results for busy and unavailable move events", () => {
    assert(
      validateInteractionEvent({ ...event, access: "busy" })
    ).toStrictEqual({
      reason: "busy-access",
      valid: false,
    });
    assert(
      validateInteractionEvent({ ...event, available: false })
    ).toStrictEqual({
      reason: "unavailable",
      valid: false,
    });
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: { ...event, access: "busy" },
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
    assert(
      transitionInteraction(createInteractionState("paint-and-move"), {
        event: { ...event, available: false },
        from: first,
        type: "move-start",
      })
    ).toStrictEqual(createInteractionState("paint-and-move"));
  });
});
