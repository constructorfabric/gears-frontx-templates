import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import type { CalendarMoveRequest } from "../../../core/model";
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

const card = (): HTMLElement => screen.getByRole("button", { name: /move/u });

// jsdom has no PointerEvent, so testing-library would drop `clientX` and `clientY`; a MouseEvent keeps them.
const touch = (target: EventTarget, type: string, clientY = 40): void => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 0,
    clientY,
  });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  act(() => {
    target.dispatchEvent(event);
  });
};

const holdAndDragTo = (time: string): void => {
  touch(card(), "pointerdown");
  act(() => {
    vi.advanceTimersByTime(350);
  });
  document.elementsFromPoint = () => [timedCell(time)];
  touch(document, "pointermove");
};

describe("WeekGrid touch move", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "elementsFromPoint");
  });

  it("moves an event held and dragged with a finger", () => {
    let request: CalendarMoveRequest | undefined;
    renderWeek({
      events: [timedEvent("move")],
      onMoveRequest: (value) => {
        request = value;
      },
    });

    holdAndDragTo("11:00");
    touch(document, "pointerup");

    assert(request?.event.id).toBe("move");
    assert(request?.from.startTime).toStrictEqual(parseLocalTime("09:00"));
    assert(request?.to.startTime).toStrictEqual(parseLocalTime("11:00"));
  });

  it("finds the slot under the finger when the grid is in a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const container = shadow.appendChild(document.createElement("div"));
    let request: CalendarMoveRequest | undefined;
    render(
      <WeekGrid
        date={DATE}
        events={[timedEvent("move")]}
        interactionMode="paint-and-move"
        onMoveRequest={(value) => {
          request = value;
        }}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />,
      { container }
    );
    const cell = within(container).getByRole("gridcell", {
      name: /Monday, August 24, 2026 11:00/u,
    });
    shadow.elementsFromPoint = () => [cell];
    document.elementsFromPoint = () => [];

    touch(within(container).getByRole("button", { name: /move/u }), "pointerdown");
    act(() => {
      vi.advanceTimersByTime(350);
    });
    touch(document, "pointermove", 40);
    touch(document, "pointerup");

    assert(request?.to.startTime).toStrictEqual(parseLocalTime("11:00"));
    host.remove();
  });

  it("leaves a quick touch to the page", () => {
    const onMoveRequest = vi.fn();
    renderWeek({ events: [timedEvent("move")], onMoveRequest });

    touch(card(), "pointerdown");
    document.elementsFromPoint = () => [timedCell("11:00")];
    touch(document, "pointermove");
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("does not move when the browser takes the gesture for scrolling", () => {
    const onMoveRequest = vi.fn();
    renderWeek({ events: [timedEvent("move")], onMoveRequest });

    touch(card(), "pointerdown");
    touch(document, "pointercancel");
    act(() => {
      vi.advanceTimersByTime(350);
    });
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("cancels the move on Escape", () => {
    const onMoveRequest = vi.fn();
    renderWeek({ events: [timedEvent("move")], onMoveRequest });

    holdAndDragTo("11:00");
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("moves a recurring event dragged with a finger only when recurringEventsMovable is set", () => {
    const onMoveRequest = vi.fn();
    renderWeek({
      events: [{ ...timedEvent("move"), recurrenceRule: "FREQ=WEEKLY" }],
      onMoveRequest,
      recurringEventsMovable: true,
    });

    holdAndDragTo("11:00");
    touch(document, "pointerup");

    assert(onMoveRequest).toHaveBeenCalledOnce();
  });

  it("does not move a recurring event dragged with a finger by default", () => {
    const onMoveRequest = vi.fn();
    renderWeek({
      events: [{ ...timedEvent("move"), recurrenceRule: "FREQ=WEEKLY" }],
      onMoveRequest,
    });

    holdAndDragTo("11:00");
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("does not move an event pinned with movable: false", () => {
    const onMoveRequest = vi.fn();
    renderWeek({
      events: [timedEvent({ id: "move", movable: false, title: "move" })],
      onMoveRequest,
    });

    holdAndDragTo("11:00");
    touch(document, "pointerup");

    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("ignores a mouse press", () => {
    const onMoveRequest = vi.fn();
    renderWeek({ events: [timedEvent("move")], onMoveRequest });

    fireEvent.pointerDown(card(), { button: 0, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(350);
    });
    document.elementsFromPoint = () => [timedCell("11:00")];
    fireEvent.pointerMove(document, { pointerId: 1 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    assert(onMoveRequest).not.toHaveBeenCalled();
  });
});
