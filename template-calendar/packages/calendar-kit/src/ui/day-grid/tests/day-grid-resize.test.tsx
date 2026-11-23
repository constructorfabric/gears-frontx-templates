import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  timedEvent as fixtureTimedEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarResizeRequest } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../day-grid";
import type { DayGridProps } from "../day-grid";

// jsdom has no layout, so each hour row is given a fixed height for the pointer-to-slot lookup.
const rowHeight = 43;

const rowCenter = (hour: number): number => hour * rowHeight + rowHeight / 2;

const stubRowRects = (): void => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const rows = Array.from(
        this.closest("section")?.querySelectorAll('[role="gridcell"]') ?? []
      );
      const index = rows.indexOf(this);

      return index < 0
        ? new DOMRect()
        : new DOMRect(0, index * rowHeight, 100, rowHeight);
    }
  );
};

// jsdom has no PointerEvent, so testing-library would drop `clientY`; a MouseEvent keeps it.
const pointerAt = (
  target: HTMLElement,
  type: "pointermove" | "pointerup",
  clientY: number
): void => {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientY })
    );
  });
};

const baseProps = {
  date: calendarDate("2026-08-24"),
  events: [],
  interactionMode: "paint-and-move",
  locale: "en-US",
  now: utcInstant("2026-08-23T06:00:00.000Z"),
  t,
  timeZone: UTC,
} as const;

const renderDay = (props: Partial<Omit<DayGridProps, "maxEventsPerSlot" | "onOverflowSelect">>) =>
  render(<DayGrid {...baseProps} {...props} />);

const handle = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-resize-handle]");

const dragHandleTo = (clientY: number): void => {
  const grip = handle();

  if (grip === null) {
    throw new Error("Expected a resize handle");
  }

  fireEvent.pointerDown(grip, { button: 0, pointerId: 1 });
  pointerAt(grip, "pointermove", clientY);
  pointerAt(grip, "pointerup", clientY);
};

describe("DayGrid resize", () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    stubRowRects();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the host to end the event where the handle is released", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderDay({ events: [fixtureTimedEvent("resize")], onResizeRequest });

    dragHandleTo(rowCenter(11));

    expect(onResizeRequest).toHaveBeenCalledOnce();
    expect(onResizeRequest.mock.calls[0]?.[0].event.id).toBe("resize");
    expect(onResizeRequest.mock.calls[0]?.[0].to.endTime).toStrictEqual(
      parseLocalTime("11:30")
    );
  });

  it.each([
    [10, "11:15"],
    [30, "11:45"],
  ])(
    "snaps the end to the nearest quarter hour, %d px into the 11:00 row",
    (offset, endTime) => {
      const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
      renderDay({ events: [fixtureTimedEvent("resize")], onResizeRequest });

      dragHandleTo(11 * rowHeight + offset);

      expect(onResizeRequest.mock.calls[0]?.[0].to.endTime).toStrictEqual(
        parseLocalTime(endTime)
      );
    }
  );

  it("refuses an end at or before the start", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderDay({ events: [fixtureTimedEvent("resize")], onResizeRequest });

    dragHandleTo(rowCenter(8));

    expect(onResizeRequest).not.toHaveBeenCalled();
  });

  it("resizes a recurring event when recurringEventsMovable is set", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderDay({
      events: [fixtureTimedEvent({ id: "resize", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" })],
      onResizeRequest,
      recurringEventsMovable: true,
    });

    dragHandleTo(rowCenter(11));

    expect(onResizeRequest).toHaveBeenCalledOnce();
    expect(onResizeRequest.mock.calls[0]?.[0].event.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("does not start a paint while the handle is dragged", () => {
    const onPaintSelect = vi.fn();
    renderDay({
      events: [fixtureTimedEvent("resize")],
      onPaintSelect,
      onResizeRequest: vi.fn(),
    });

    dragHandleTo(rowCenter(11));

    expect(onPaintSelect).not.toHaveBeenCalled();
  });

  it("moves the end one slot with Alt+ArrowDown on the focused card", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderDay({ events: [fixtureTimedEvent("resize")], onResizeRequest });

    fireEvent.keyDown(screen.getByRole("button", { name: /resize/u }), {
      altKey: true,
      key: "ArrowDown",
    });

    expect(onResizeRequest.mock.calls[0]?.[0].to.endTime).toStrictEqual(
      parseLocalTime("11:00")
    );
  });

  it.each([
    [
      "a recurring event",
      fixtureTimedEvent({ id: "resize", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" }),
    ],
    [
      "an event pinned with movable: false",
      fixtureTimedEvent({ id: "resize", movable: false }),
    ],
    ["an unavailable event", fixtureTimedEvent({ available: false, id: "resize" })],
  ])("has no handle on %s", (_name, event) => {
    renderDay({ events: [event] });

    expect(handle()).toBeNull();
  });

  it("has no handle outside paint-and-move mode", () => {
    renderDay({
      events: [fixtureTimedEvent("resize")],
      interactionMode: "quick-create",
    });

    expect(handle()).toBeNull();
  });
});

