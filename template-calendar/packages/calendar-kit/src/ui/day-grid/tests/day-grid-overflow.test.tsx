import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarCell } from "../../../core/model";
import { DayGrid } from "../day-grid";

const DATE = calendarDate("2026-09-14");

const hourEvent = (id: string, title: string) =>
  timedEvent({
    endTime: "15:00",
    id,
    startDate: "2026-09-14",
    startTime: "14:00",
    title,
  });

const fiveInHour = [1, 2, 3, 4, 5].map((number) =>
  hourEvent(`event-${number}`, `Event ${number}`)
);

describe("DayGrid maxEventsPerSlot", () => {
  it("draws every card when no cap is set", () => {
    render(<DayGrid date={DATE} events={fiveInHour} timeZone={UTC} />);

    assert(screen.getAllByRole("button", { name: /^Event \d/u })).toHaveLength(
      5
    );
    assert(screen.queryByRole("button", { name: /^\+ \d+ events$/u })).toBeNull();
  });

  it("keeps the earliest cards in the slot and shows a +N lane tile for the rest", async () => {
    const user = userEvent.setup();
    const selected: CalendarCell[] = [];

    render(
      <DayGrid
        date={DATE}
        events={fiveInHour}
        maxEventsPerSlot={3}
        onOverflowSelect={(cell) => {
          selected.push(cell);
        }}
        timeZone={UTC}
      />
    );

    assert(screen.getAllByRole("button", { name: /^Event \d/u })).toHaveLength(
      3
    );

    await user.click(screen.getByRole("button", { name: "+ 2 events" }));

    assert(selected).toHaveLength(1);
    assert(selected[0]?.startTime).toBe("14:00");
  });

  it("places the +N tile in the lane after the visible cards", () => {
    render(
      <DayGrid
        date={DATE}
        events={fiveInHour}
        maxEventsPerSlot={3}
        onOverflowSelect={vi.fn()}
        timeZone={UTC}
      />
    );

    const lastCard = screen
      .getByRole("button", { name: /^Event 3 /u })
      .closest<HTMLElement>(".timedEvent");
    const tileWrapper = screen
      .getByRole("button", { name: "+ 2 events" })
      .closest<HTMLElement>(".timedEvent");

    assert(
      parseFloat(tileWrapper?.style.insetInlineStart ?? "")
    ).toBeGreaterThan(parseFloat(lastCard?.style.insetInlineStart ?? ""));
    // Three cards and the tile share the row, so each lane is a quarter of the usable width.
    assert(tileWrapper?.style.inlineSize).toBe(
      "calc(24.5% - var(--calendar-event-inset))"
    );
  });
});
