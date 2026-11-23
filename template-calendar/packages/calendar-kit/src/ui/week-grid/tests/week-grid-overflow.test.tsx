import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import type { CalendarCell } from "../../../core/model";
import { WeekGrid } from "../week-grid";

const DATE = calendarDate("2026-09-14");

const hourEvent = (id: string, title: string, startTime: string) =>
  timedEvent({
    endTime: "10:00",
    id,
    startDate: "2026-09-14",
    startTime,
    title,
  });

const crowdedHour = [1, 2, 3, 4].map((number) =>
  hourEvent(`event-${number}`, `Event ${number}`, "09:00")
);

// Listed latest-first so that keeping the earliest is not the same as keeping the first in input order.
const staggeredHour = [
  hourEvent("event-4", "Event 4", "09:30"),
  hourEvent("event-3", "Event 3", "09:20"),
  hourEvent("event-2", "Event 2", "09:10"),
  hourEvent("event-1", "Event 1", "09:00"),
];

describe("WeekGrid maxEventsPerSlot", () => {
  it("draws every card when no cap is set", () => {
    render(<WeekGrid date={DATE} events={crowdedHour} timeZone={UTC} />);

    assert(screen.getAllByRole("button", { name: /^Event \d/u })).toHaveLength(
      4
    );
    assert(screen.queryByRole("button", { name: "+2 hidden" })).toBeNull();
  });

  it("keeps the earliest cards in the slot and shows a +N chip for the rest", async () => {
    const user = userEvent.setup();
    const selected: CalendarCell[] = [];
    const quickCreate = vi.fn();

    render(
      <WeekGrid
        date={DATE}
        events={staggeredHour}
        timeZone={UTC}
        maxEventsPerSlot={2}
        onOverflowSelect={(cell) => {
          selected.push(cell);
        }}
        onQuickCreate={quickCreate}
      />
    );

    assert(screen.getAllByRole("button", { name: /^Event \d/u })).toHaveLength(
      2
    );
    assert(
      screen.getByRole("button", { name: /^Event 1 /u })
    ).toBeInTheDocument();
    assert(
      screen.getByRole("button", { name: /^Event 2 /u })
    ).toBeInTheDocument();
    assert(screen.queryByRole("button", { name: /^Event 3 /u })).toBeNull();
    assert(screen.queryByRole("button", { name: /^Event 4 /u })).toBeNull();

    const chip = screen.getByRole("button", { name: "+2 hidden" });

    await user.click(chip);

    assert(selected).toHaveLength(1);
    assert(selected[0]?.startTime).toBe("09:00");
    assert(quickCreate).not.toHaveBeenCalled();
  });

  it("shows the +N chip as plain text when there is no onOverflowSelect", () => {
    render(
      <WeekGrid
        date={DATE}
        events={crowdedHour}
        timeZone={UTC}
        maxEventsPerSlot={2}
      />
    );

    assert(screen.queryByRole("button", { name: "+2 hidden" })).toBeNull();
    assert(screen.getByText("+2 hidden")).toBeInTheDocument();
  });

  it("takes the accessible name of the chip from renderOverflow content", () => {
    render(
      <WeekGrid
        date={DATE}
        events={crowdedHour}
        timeZone={UTC}
        maxEventsPerSlot={2}
        onOverflowSelect={() => undefined}
        renderOverflow={(hiddenCount) => `${hiddenCount} more`}
      />
    );

    assert(screen.getByRole("button", { name: "2 more" })).toBeInTheDocument();
  });

  it("rejects a cap that is not a positive integer", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    assert(() =>
      render(
        <WeekGrid
          date={DATE}
          events={crowdedHour}
          timeZone={UTC}
          maxEventsPerSlot={0}
        />
      )
    ).toThrow(RangeError);
  });
});
