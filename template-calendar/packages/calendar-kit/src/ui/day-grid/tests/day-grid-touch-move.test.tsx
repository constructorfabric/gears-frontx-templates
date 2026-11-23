import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type { CalendarMoveRequest } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../day-grid";
import type { DayGridProps } from "../day-grid";

// jsdom has no layout, so each hour row is given a fixed height for the pointer-to-slot lookup.
const rowHeight = 43;

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

// jsdom has no PointerEvent, so testing-library would drop `clientY`; a MouseEvent keeps it.
const touch = (target: EventTarget, type: string, clientY = 0): void => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  act(() => {
    target.dispatchEvent(event);
  });
};

const hold = (): void => {
  touch(screen.getByRole("button", { name: /move/u }), "pointerdown");
  act(() => {
    vi.advanceTimersByTime(350);
  });
};

describe("DayGrid touch move", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubRowRects();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves an event held and dragged with a finger", () => {
    let request: CalendarMoveRequest | undefined;
    renderDay({
      events: [timedEvent("move")],
      onMoveRequest: (value) => {
        request = value;
      },
    });

    hold();
    touch(document, "pointermove", 11 * rowHeight + 5);
    touch(document, "pointerup");

    assert(request?.event.id).toBe("move");
    assert(request?.to.startTime).toStrictEqual(parseLocalTime("11:00"));
  });

  it("leaves a quick touch to the page", () => {
    const onMoveRequest = vi.fn();
    renderDay({ events: [timedEvent("move")], onMoveRequest });

    touch(screen.getByRole("button", { name: /move/u }), "pointerdown");
    touch(document, "pointermove", 11 * rowHeight + 5);
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("moves a recurring event dragged with a finger only when recurringEventsMovable is set", () => {
    const onMoveRequest = vi.fn();
    renderDay({
      events: [{ ...timedEvent("move"), recurrenceRule: "FREQ=WEEKLY" }],
      onMoveRequest,
      recurringEventsMovable: true,
    });

    hold();
    touch(document, "pointermove", 11 * rowHeight + 5);
    touch(document, "pointerup");

    assert(onMoveRequest).toHaveBeenCalledOnce();
  });

  it("does not move an event pinned with movable: false", () => {
    const onMoveRequest = vi.fn();
    renderDay({
      events: [timedEvent({ id: "move", movable: false, title: "move" })],
      onMoveRequest,
    });

    hold();
    touch(document, "pointermove", 11 * rowHeight + 5);
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });
});
