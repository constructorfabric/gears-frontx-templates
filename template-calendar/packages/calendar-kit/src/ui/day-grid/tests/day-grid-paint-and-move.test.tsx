import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  timedEvent as fixtureTimedEvent,
  UTC,
} from "../../../__test-utils__/fixtures";
import type { CalendarEvent } from "../../../core/model";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { DayGrid } from "../day-grid";

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

// jsdom has no DragEvent, so testing-library would drop `clientY`; a MouseEvent keeps it.
const dragAt = (
  target: HTMLElement,
  type: "dragover" | "drop",
  clientY: number
): void => {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientY })
    );
  });
};

const gridCells = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]'));

const architecture: CalendarEvent = fixtureTimedEvent({
  attendees: [],
  calendarId: null,
  colorFamily: "turquoise",
  conferencingProviderId: null,
  description: "",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: calendarDate("2026-08-24"),
  endTime: parseLocalTime("10:00"),
  id: "architecture",
  location: null,
  recurrenceRule: null,
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: calendarDate("2026-08-24"),
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Architecture",
});

const baseProps = {
  date: calendarDate("2026-08-24"),
  events: [architecture],
  locale: "en-US",
  now: utcInstant("2026-08-23T06:00:00.000Z"),
  t,
  timeZone: UTC,
};

describe("DayGrid paint-and-move", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("paints a range from pointer down to pointer up as one selection", () => {
    stubRowRects();
    const onPaintSelect = vi.fn();
    const { container } = render(
      <DayGrid
        {...baseProps}
        events={[]}
        interactionMode="paint-and-move"
        onPaintSelect={onPaintSelect}
      />
    );
    const cells = gridCells(container);

    fireEvent.pointerDown(cells[13], { clientY: rowCenter(13) });
    fireEvent.pointerMove(cells[15], { clientY: rowCenter(15) });
    fireEvent.pointerUp(cells[15], { clientY: rowCenter(15) });

    expect(onPaintSelect).toHaveBeenCalledTimes(1);
    const range = onPaintSelect.mock.calls[0]?.[0];
    expect(range.cells).toHaveLength(3);
    expect(range.start.start).toBe(utcInstant("2026-08-24T13:00:00.000Z"));
    expect(range.end.end).toBe(utcInstant("2026-08-24T16:00:00.000Z"));
  });

  it("draws a preview over the painted rows labelled with the viewer-time range", () => {
    stubRowRects();
    const { container } = render(
      <DayGrid {...baseProps} events={[]} interactionMode="paint-and-move" />
    );
    const cells = gridCells(container);

    fireEvent.pointerDown(cells[13], { clientY: rowCenter(13) });
    fireEvent.pointerMove(cells[15], { clientY: rowCenter(15) });

    const preview = container.querySelector<HTMLElement>("[data-paint-preview]");
    expect(preview).not.toBeNull();
    expect(preview?.style.blockSize).toBe(`${(3 / cells.length) * 100}%`);
    expect(preview?.style.insetBlockStart).toBe(`${(13 / cells.length) * 100}%`);
    expect(preview?.textContent).toContain("13:00 – 16:00");
    expect(preview?.querySelector("svg.lucide-clock")).not.toBeNull();
  });

  it("draws the preview as a bar and a time row whose clock icon leads the label", () => {
    stubRowRects();
    const { container } = render(
      <DayGrid {...baseProps} events={[]} interactionMode="paint-and-move" />
    );
    const cells = gridCells(container);

    fireEvent.pointerDown(cells[13], { clientY: rowCenter(13) });
    fireEvent.pointerMove(cells[15], { clientY: rowCenter(15) });

    const [bar, time] = Array.from(
      container.querySelector("[data-paint-preview]")?.children ?? []
    );
    expect(bar).toBeEmptyDOMElement();
    expect(time?.firstElementChild).toHaveClass("lucide-clock");
    expect(time).toHaveTextContent("13:00 – 16:00");
  });

  it("clears the painted range once the pointer leaves the grid after the paint is emitted", () => {
    stubRowRects();
    const { container } = render(
      <DayGrid {...baseProps} events={[]} interactionMode="paint-and-move" />
    );
    const cells = gridCells(container);

    fireEvent.pointerDown(cells[13], { clientY: rowCenter(13) });
    fireEvent.pointerUp(cells[13], { clientY: rowCenter(13) });
    expect(container.querySelector("[data-paint]")).not.toBeNull();

    // The host's form opens over the grid, so the pointer leaves it.
    for (
      let node: HTMLElement | null = cells[13].parentElement;
      node !== null && node !== container;
      node = node.parentElement
    ) {
      fireEvent.pointerLeave(node);
    }

    expect(container.querySelector("[data-paint]")).toBeNull();
  });

  it("does not open the quick-create form on a click in paint-and-move mode", () => {
    stubRowRects();
    const onQuickCreate = vi.fn();
    const { container } = render(
      <DayGrid
        {...baseProps}
        events={[]}
        interactionMode="paint-and-move"
        onQuickCreate={onQuickCreate}
      />
    );

    fireEvent.click(gridCells(container)[13], { clientY: rowCenter(13) });

    expect(onQuickCreate).not.toHaveBeenCalled();
  });

  it("reports a dropped event as a move to the drop slot until the host confirms it", () => {
    stubRowRects();
    const onMoveRequest = vi.fn();
    const { container } = render(
      <DayGrid
        {...baseProps}
        interactionMode="paint-and-move"
        onMoveRequest={onMoveRequest}
      />
    );
    const cells = gridCells(container);
    // A browser starts the drag on the draggable frame around the card.
    const frame = container
      .querySelector('[data-event-id="architecture"]')
      ?.closest('[draggable="true"]');

    fireEvent.dragStart(frame!, { dataTransfer: { setDragImage: vi.fn() } });
    dragAt(cells[12], "dragover", rowCenter(12));

    const ghost = container.querySelector<HTMLElement>("[data-drag-ghost]");
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost?.textContent).toMatch(/12:00/u);
    // The ghost is the drop feedback; a full-width cell outline would hide which lane it lands in.
    expect(container.querySelector("[data-drop-target]")).toBeNull();

    dragAt(cells[12], "drop", rowCenter(12));

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const request = onMoveRequest.mock.calls[0]?.[0];
    expect(request.event.id).toBe("architecture");
    expect(request.to.start).toBe(utcInstant("2026-08-24T12:00:00.000Z"));
    expect(container.querySelector("[data-drag-ghost]")).toBeNull();
  });

  it("does not make a recurring event draggable", () => {
    const recurring = { ...architecture, recurrenceRule: "FREQ=WEEKLY" };
    const { container } = render(
      <DayGrid
        {...baseProps}
        events={[recurring]}
        interactionMode="paint-and-move"
        onMoveRequest={vi.fn()}
      />
    );

    const card = container.querySelector<HTMLElement>(
      '[data-event-id="architecture"]'
    );

    expect(card?.closest("[draggable]")?.getAttribute("draggable")).toBe(
      "false"
    );
  });

  it("moves a recurring event when recurringEventsMovable is set", () => {
    stubRowRects();
    const onMoveRequest = vi.fn();
    const recurring = { ...architecture, recurrenceRule: "FREQ=WEEKLY" };
    const { container } = render(
      <DayGrid
        {...baseProps}
        events={[recurring]}
        interactionMode="paint-and-move"
        onMoveRequest={onMoveRequest}
        recurringEventsMovable
      />
    );
    const cells = gridCells(container);
    // A browser starts the drag on the draggable frame around the card.
    const frame = container
      .querySelector('[data-event-id="architecture"]')
      ?.closest('[draggable="true"]');

    fireEvent.dragStart(frame!, { dataTransfer: { setDragImage: vi.fn() } });
    dragAt(cells[12], "drop", rowCenter(12));

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(onMoveRequest.mock.calls[0]?.[0].event.recurrenceRule).toBe("FREQ=WEEKLY");
  });

  it("keeps an event the host marks movable: false in place", () => {
    const { container } = render(
      <DayGrid
        {...baseProps}
        events={[{ ...architecture, movable: false }]}
        interactionMode="paint-and-move"
        onMoveRequest={vi.fn()}
      />
    );

    const card = container.querySelector<HTMLElement>(
      '[data-event-id="architecture"]'
    );

    expect(card?.closest("[draggable]")?.getAttribute("draggable")).toBe(
      "false"
    );
  });

  it("keeps events fixed in quick-create mode", () => {
    const { container } = render(
      <DayGrid {...baseProps} onMoveRequest={vi.fn()} />
    );

    const card = container.querySelector<HTMLElement>(
      '[data-event-id="architecture"]'
    );

    expect(card?.closest("[draggable]")?.getAttribute("draggable")).toBe(
      "false"
    );
  });
});
