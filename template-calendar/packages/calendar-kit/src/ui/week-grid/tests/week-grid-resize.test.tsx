import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type { CalendarResizeRequest } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DATE = calendarDate("2026-08-24");

const renderWeek = (props: Partial<Omit<WeekGridProps, "maxEventsPerSlot" | "onOverflowSelect">>) =>
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      interactionMode="paint-and-move"
      {...props}
    />
  );

const timedCell = (time: string): HTMLElement =>
  screen.getByRole("gridcell", {
    name: new RegExp(`Monday, August 24, 2026 ${time}`, "u"),
  });

const handle = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-resize-handle]");

const frame = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>("[data-event-id]");

  if (element === null) {
    throw new Error("Expected an event frame");
  }

  return element;
};

// jsdom has no layout: every element is one hour tall, so `clientY` inside it picks the time.
const SLOT_HEIGHT = 60;

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

/** Drags the handle to `clientY` inside `time`'s slot (half way by default), then releases. */
const dragHandleTo = (time: string, clientY = SLOT_HEIGHT / 2): void => {
  const grip = handle();

  if (grip === null) {
    throw new Error("Expected a resize handle");
  }

  document.elementsFromPoint = () => [timedCell(time)];
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1 });
  pointerAt(grip, "pointermove", clientY);
  fireEvent.pointerUp(grip, { pointerId: 1 });
};

describe("WeekGrid resize", () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 100, SLOT_HEIGHT)
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "elementsFromPoint");
    vi.restoreAllMocks();
  });

  it("asks the host to end the event where the handle is released", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderWeek({ events: [timedEvent("resize")], onResizeRequest });

    dragHandleTo("11:00");

    assert(onResizeRequest).toHaveBeenCalledOnce();
    assert(onResizeRequest.mock.calls[0]?.[0].event.id).toBe("resize");
    assert(onResizeRequest.mock.calls[0]?.[0].to.endTime).toStrictEqual(
      parseLocalTime("11:30")
    );
  });

  it.each([
    [10, "11:15"],
    [40, "11:45"],
  ])(
    "snaps the end to the nearest quarter hour, %d px into the 11:00 slot",
    (clientY, endTime) => {
      const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
      renderWeek({ events: [timedEvent("resize")], onResizeRequest });

      dragHandleTo("11:00", clientY);

      assert(onResizeRequest.mock.calls[0]?.[0].to.endTime).toStrictEqual(
        parseLocalTime(endTime)
      );
    }
  );

  it("refuses an end at or before the start", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderWeek({ events: [timedEvent("resize")], onResizeRequest });

    dragHandleTo("08:00");

    assert(onResizeRequest).not.toHaveBeenCalled();
  });

  it("does not ask when the end stays where it is", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderWeek({ events: [timedEvent("resize")], onResizeRequest });

    dragHandleTo("09:00", SLOT_HEIGHT);

    assert(onResizeRequest).not.toHaveBeenCalled();
  });

  it("shows the new size until the host answers, then restores it on cancel", () => {
    let request: CalendarResizeRequest | undefined;
    renderWeek({
      events: [timedEvent("resize")],
      onResizeRequest: (value) => {
        request = value;
      },
    });
    const before = frame().style.blockSize;
    document.elementsFromPoint = () => [timedCell("11:00")];
    const grip = handle();

    if (grip === null) {
      throw new Error("Expected a resize handle");
    }

    fireEvent.pointerDown(grip, { button: 0, pointerId: 1 });
    pointerAt(grip, "pointermove", SLOT_HEIGHT / 2);

    assert(frame().style.blockSize).not.toBe(before);

    fireEvent.pointerUp(grip, { pointerId: 1 });

    assert(frame().style.blockSize).not.toBe(before);

    act(() => {
      request?.cancel();
    });

    assert(frame().style.blockSize).toBe(before);
  });

  it("moves the end one slot with Alt+ArrowDown on the focused card", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderWeek({ events: [timedEvent("resize")], onResizeRequest });

    fireEvent.keyDown(screen.getByRole("button", { name: /resize/u }), {
      altKey: true,
      key: "ArrowDown",
    });

    assert(onResizeRequest.mock.calls[0]?.[0].to.endTime).toStrictEqual(
      parseLocalTime("11:00")
    );
  });

  it.each([
    [
      "a recurring event",
      timedEvent({ id: "resize", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" }),
    ],
    ["an event pinned with movable: false", timedEvent({ id: "resize", movable: false })],
    ["an unavailable event", timedEvent({ available: false, id: "resize" })],
  ])("has no handle on %s", (_name, event) => {
    renderWeek({ events: [event] });

    assert(handle()).toBeNull();
  });

  it("resizes a recurring event when recurringEventsMovable is set", () => {
    const onResizeRequest = vi.fn<(request: CalendarResizeRequest) => void>();
    renderWeek({
      events: [timedEvent({ id: "resize", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" })],
      onResizeRequest,
      recurringEventsMovable: true,
    });

    dragHandleTo("11:00");

    assert(onResizeRequest).toHaveBeenCalledOnce();
    assert(onResizeRequest.mock.calls[0]?.[0].event.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("has no handle on a recurring event pinned with movable: false, even when recurring events are movable", () => {
    renderWeek({
      events: [timedEvent({ id: "resize", movable: false, recurrenceRule: "FREQ=WEEKLY" })],
      recurringEventsMovable: true,
    });

    assert(handle()).toBeNull();
  });

  it("has no handle outside paint-and-move mode", () => {
    renderWeek({
      events: [timedEvent("resize")],
      interactionMode: "quick-create",
    });

    assert(handle()).toBeNull();
  });
});
