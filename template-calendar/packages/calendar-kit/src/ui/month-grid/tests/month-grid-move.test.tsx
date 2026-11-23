import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect as assert, it, vi } from "vitest";

import { instant, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import type { CalendarMoveRequest } from "../../../core/model";
import { calendarDate, fromViewerDateTime } from "../../../core/model";
import { MonthGrid } from "../month-grid";
import type { MonthGridProps } from "../month-grid";

const meeting = timedEvent({
  endDate: "2025-09-01",
  endTime: "10:00",
  id: "meeting",
  startDate: "2025-09-01",
  startTime: "09:00",
  title: "Meeting",
});

const renderMonth = (overrides: Partial<MonthGridProps> = {}) =>
  render(
    <MonthGrid
      date={calendarDate("2025-09-01")}
      events={[meeting]}
      timeZone={UTC}
      {...overrides}
    />
  );

const dayCell = (label: string): HTMLElement =>
  screen.getByRole("gridcell", { name: new RegExp(`^${label}`, "u") });

const WEDNESDAY = "Wednesday, September 3, 2025";
const MONDAY = "Monday, September 1, 2025";

const dropTargets = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-drop-target]"));

describe("MonthGrid drag to move", () => {
  it("moves a timed event to the dropped day at the same time of day", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    renderMonth({ onMoveRequest });

    fireEvent.dragStart(screen.getByRole("button", { name: /Meeting/u }));
    fireEvent.dragOver(dayCell(WEDNESDAY));
    fireEvent.drop(dayCell(WEDNESDAY));

    assert(onMoveRequest).toHaveBeenCalledOnce();
    const request = onMoveRequest.mock.calls.at(0)?.[0];
    assert(request?.event.id).toBe("meeting");
    assert(request?.from).toMatchObject({
      date: "2025-09-01",
      end: instant("2025-09-01", "10:00"),
      start: instant("2025-09-01", "09:00"),
    });
    assert(request?.to).toMatchObject({
      date: "2025-09-03",
      end: instant("2025-09-03", "10:00"),
      endTime: "10:00",
      start: instant("2025-09-03", "09:00"),
      startTime: "09:00",
    });
  });

  it("marks only the hovered day cell while the move is over another day", () => {
    renderMonth({ onMoveRequest: vi.fn() });

    fireEvent.dragStart(screen.getByRole("button", { name: /Meeting/u }));
    fireEvent.dragOver(dayCell(WEDNESDAY));

    assert(dropTargets()).toHaveLength(1);
    assert(dayCell(WEDNESDAY).dataset.dropTarget).toBe("");
    assert(dayCell(MONDAY).hasAttribute("data-drop-target")).toBe(false);
  });

  it("marks nothing and requests nothing when dropped on its own day", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    renderMonth({ onMoveRequest });

    fireEvent.dragStart(screen.getByRole("button", { name: /Meeting/u }));
    fireEvent.dragOver(dayCell(MONDAY));
    assert(dropTargets()).toHaveLength(0);

    fireEvent.drop(dayCell(MONDAY));
    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("cancels the move and clears the mark when the drag ends without a drop", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    renderMonth({ onMoveRequest });

    const button = screen.getByRole("button", { name: /Meeting/u });
    fireEvent.dragStart(button);
    fireEvent.dragOver(dayCell(WEDNESDAY));
    fireEvent.dragEnd(button);

    assert(dropTargets()).toHaveLength(0);
    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("clears the mark when the pointer leaves the grid", () => {
    renderMonth({ onMoveRequest: vi.fn() });

    fireEvent.dragStart(screen.getByRole("button", { name: /Meeting/u }));
    fireEvent.dragOver(dayCell(WEDNESDAY));

    // jsdom drops relatedTarget from the init dict, so it is set on the event itself.
    const leave = createEvent.dragLeave(dayCell(WEDNESDAY));
    Object.defineProperty(leave, "relatedTarget", { value: document.body });
    fireEvent(dayCell(WEDNESDAY), leave);

    assert(dropTargets()).toHaveLength(0);
  });

  it("does not offer a move when no move handler is supplied", () => {
    renderMonth();

    fireEvent.dragStart(screen.getByRole("button", { name: /Meeting/u }));
    fireEvent.dragOver(dayCell(WEDNESDAY));

    assert(dropTargets()).toHaveLength(0);
  });

  it("omits the draggable attribute on event slots that cannot move", () => {
    renderMonth();

    assert(document.querySelector("[draggable]")).toBeNull();
  });

  it("keeps the seconds of the event start and end on the dropped day", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    const withSeconds = timedEvent({
      end: fromViewerDateTime({
        date: calendarDate("2025-09-01"),
        time: "10:00:30",
        timeZone: UTC,
      }),
      endDate: "2025-09-01",
      id: "seconds",
      start: fromViewerDateTime({
        date: calendarDate("2025-09-01"),
        time: "09:00:30",
        timeZone: UTC,
      }),
      startDate: "2025-09-01",
      title: "Seconds",
    });
    renderMonth({ events: [withSeconds], onMoveRequest });

    fireEvent.dragStart(screen.getByRole("button", { name: /Seconds/u }));
    fireEvent.dragOver(dayCell(WEDNESDAY));
    fireEvent.drop(dayCell(WEDNESDAY));

    const request = onMoveRequest.mock.calls.at(0)?.[0];
    assert(request?.to.start).toBe(
      fromViewerDateTime({
        date: calendarDate("2025-09-03"),
        time: "09:00:30",
        timeZone: UTC,
      })
    );
    assert(request?.to.end).toBe(
      fromViewerDateTime({
        date: calendarDate("2025-09-03"),
        time: "10:00:30",
        timeZone: UTC,
      })
    );
  });
});
