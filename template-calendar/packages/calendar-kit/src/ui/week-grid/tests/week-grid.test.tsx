import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect as assert, it, vi } from "vitest";

import { allDayEvent, timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarConflict,
  CalendarEvent,
  CalendarSelectionRange,
  CalendarEventRenderContext,
  CalendarMoveRequest,
} from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import type { CalendarQuickCreatePayload } from "../../../react/slots";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";
import styles from "../week-grid.module.css";

const DATE = calendarDate("2026-08-24");

interface Payload {
  readonly itemId: string;
}

interface EventOverrides {
  readonly available?: boolean;
  readonly id?: string;
}

const event = (overrides: EventOverrides = {}): CalendarEvent<Payload> => {
  const baseEvent: CalendarEvent<Payload> = {
    allDay: false,
    available: true,
    colorFamily: "purple",
    conflicts: [{ dimension: "resource", id: "conflict", label: "Resource" }],
    end: utcInstant("2026-08-24T10:00:00.000Z"),
    endDate: DATE,
    endTime: parseLocalTime("10:00"),
    id: "event-1",
    metadata: { itemId: "ITEM-103" },
    start: utcInstant("2026-08-24T09:00:00.000Z"),
    startDate: DATE,
    startTime: parseLocalTime("09:00"),
    timeZone: UTC,
    title: "Planning",
  };

  return { ...baseEvent, ...overrides };
};

const renderCappedWeek = (
  overrides: Partial<Omit<WeekGridProps<Payload>, "maxEventsPerSlot" | "onOverflowSelect">>
) =>
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      maxEventsPerSlot={1}
      onOverflowSelect={vi.fn<(cell: CalendarCell, anchor: HTMLElement) => void>()}
      {...overrides}
    />
  );

const renderWeek = (overrides: Partial<Omit<WeekGridProps<Payload>, "maxEventsPerSlot" | "onOverflowSelect">> = {}) =>
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );

const crowdedNineAm = [1, 2, 3, 4].map((number) =>
  timedEvent(`event-${number}`)
);

const getTimedCell = (time: string): HTMLElement =>
  screen.getByRole("gridcell", {
    name: new RegExp(`Monday, August 24, 2026 ${time}`, "u"),
  });

const cellAt = (time: string, date = DATE): CalendarCell => {
  const hour = Number(time.slice(0, 2));
  const nextHour = `${String(hour + 1).padStart(2, "0")}:00`;

  return {
    date,
    end: utcInstant(`${date}T${nextHour}:00.000Z`),
    endTime: parseLocalTime(nextHour),
    start: utcInstant(`${date}T${time}:00.000Z`),
    startTime: parseLocalTime(time),
  };
};

const requiredPayload = (
  value: CalendarQuickCreatePayload | undefined
): CalendarQuickCreatePayload => {
  if (!value) {
    throw new Error("Expected quick-create to emit a payload");
  }

  return value;
};

describe(WeekGrid, () => {
  it("renders semantic grid roles and the requested visible-day dimensions with one roving tab stop", () => {
    renderWeek({ visibleDays: 5 });
    const grid = screen.getByRole("grid");

    assert(grid.getAttribute("aria-colcount")).toBe("6");
    assert(within(grid).getAllByRole("columnheader")).toHaveLength(6);
    assert(within(grid).getAllByRole("gridcell").length).toBeGreaterThan(0);
    assert(
      within(grid)
        .getAllByRole("gridcell")
        .filter((cell) => cell.getAttribute("tabindex") === "0")
    ).toHaveLength(1);
  });

  it("keeps the cell label in the accessibility tree without rendering it as visible text", () => {
    renderWeek({ visibleDays: 5 });

    const timed = getTimedCell("09:00");

    assert(timed).toHaveAttribute(
      "aria-label",
      assert.stringContaining("09:00")
    );
    assert(timed.textContent).toBe("");

    const allDay = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026.*All-day events/iu,
    });

    assert(allDay.textContent).toBe("");

    assert(screen.getAllByText("All-day events")).toHaveLength(1);
  });

  it("moves focus to the exact accessible cell and emits the exact quick-create range on Enter", () => {
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    renderWeek({ interactionMode: "quick-create", onQuickCreate });
    const first = getTimedCell("09:00");

    const second = screen.getByRole("gridcell", {
      name: /Tuesday, August 25, 2026 09:00/u,
    });

    act(() => {
      first.focus();
    });
    const arrowRight = createEvent.keyDown(first, { key: "ArrowRight" });
    act(() => {
      fireEvent(first, arrowRight);
    });

    assert(arrowRight.defaultPrevented).toBeTruthy();
    assert(first).toHaveAttribute("tabindex", "-1");
    assert(second).toHaveAttribute("tabindex", "0");
    assert(second).toHaveFocus();

    const enter = createEvent.keyDown(second, { key: "Enter" });
    act(() => {
      fireEvent(second, enter);
    });

    assert(enter.defaultPrevented).toBeTruthy();
    assert(onQuickCreate).toHaveBeenCalledOnce();

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.range).toStrictEqual({
      cells: [cellAt("09:00", calendarDate("2026-08-25"))],
      end: cellAt("09:00", calendarDate("2026-08-25")),
      start: cellAt("09:00", calendarDate("2026-08-25")),
    });
  });

  it("activates an available event by click, Enter, and Space while preserving focus semantics", async () => {
    const user = userEvent.setup();
    const onEventSelect =
      vi.fn<
        (
          value: CalendarEvent<Payload>,
          context: CalendarEventRenderContext<Payload>
        ) => void
      >();

    renderWeek({ events: [event()], onEventSelect });
    const eventButton = screen.getByRole("button", { name: /Planning/u });

    act(() => {
      eventButton.focus();
    });
    assert(eventButton).toHaveFocus();

    await user.click(eventButton);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    assert(eventButton).toHaveFocus();
    assert(onEventSelect).toHaveBeenCalledTimes(3);
    assert(onEventSelect).toHaveBeenNthCalledWith(
      1,
      event(),
      assert.objectContaining({
        event: event(),
        isAvailable: true,
        isReadOnly: false,
      }),
      eventButton
    );
  });

  it("does not activate an unavailable event by click, Enter, or Space", async () => {
    const user = userEvent.setup();
    const onEventSelect =
      vi.fn<
        (
          value: CalendarEvent<Payload>,
          context: CalendarEventRenderContext<Payload>
        ) => void
      >();

    renderWeek({
      events: [event({ available: false, id: "unavailable" })],
      onEventSelect,
    });
    const eventButton = screen.getByRole("button", { name: /Planning/u });

    assert(eventButton).toHaveAttribute("aria-disabled", "true");

    act(() => {
      eventButton.focus();
    });
    await user.click(eventButton);
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    assert(onEventSelect).not.toHaveBeenCalled();
  });

  it("renders a custom event slot with opaque metadata and a labeled conflict slot", () => {
    const renderEvent = vi.fn<
      (context: CalendarEventRenderContext<Payload>) => ReactNode
    >((context: CalendarEventRenderContext<Payload>) => (
      <span>
        Custom {context.event.metadata?.itemId}{" "}
        {context.conflicts[0]?.label}
      </span>
    ));

    const renderConflict = vi.fn<(conflict: CalendarConflict) => ReactNode>(
      (conflict: CalendarConflict) => <span>Conflict: {conflict.label}</span>
    );

    renderWeek({
      events: [event()],
      interactionMode: "read-only",
      renderConflict,
      renderEvent,
      selectedEventId: "event-1",
    });

    const customEventButton = screen.getByRole("button", { name: "Planning" });
    assert(customEventButton).toHaveAttribute("aria-pressed", "true");
    assert(customEventButton).toHaveAttribute(
      "aria-description",
      "Past, Read only"
    );
    assert(customEventButton).not.toHaveAttribute("aria-disabled");
    assert(screen.getByText("Custom ITEM-103 Resource")).toBeTruthy();
    assert(renderEvent).toHaveBeenCalledWith(
      assert.objectContaining({ event: event() })
    );
    assert(renderConflict).toHaveBeenCalledWith(
      assert.objectContaining({ dimension: "resource", label: "Resource" }),
      assert.objectContaining({ event: event() })
    );
  });

  it("renders the ordinary grid without status or alert regions", () => {
    const { rerender } = renderWeek({});

    assert(screen.getByRole("grid")).toBeInTheDocument();

    rerender(
      <WeekGrid
        date={DATE}
        events={[]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );
    assert(screen.getByRole("grid")).toBeInTheDocument();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects create, paint, and move interactions in read-only mode", () => {
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const onMoveRequest = vi.fn<() => void>();
    renderWeek({
      events: [event()],
      interactionMode: "read-only",
      onMoveRequest,
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
      onQuickCreate,
    });
    const first = getTimedCell("10:00");
    const second = getTimedCell("11:00");
    const eventButton = screen.getByRole("button", { name: /Planning/u });

    fireEvent.click(first);
    fireEvent.pointerDown(first);
    fireEvent.pointerMove(second);
    fireEvent.pointerEnter(second);
    fireEvent.pointerUp(second);
    fireEvent.dragStart(eventButton);
    fireEvent.drop(second);

    assert(onQuickCreate).not.toHaveBeenCalled();
    assert(onPaintSelect).not.toHaveBeenCalled();
    assert(onMoveRequest).not.toHaveBeenCalled();
  });

  it("moves a recurring event only when recurringEventsMovable is set", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    renderWeek({
      events: [{ ...timedEvent("recurring"), recurrenceRule: "FREQ=WEEKLY" }],
      interactionMode: "paint-and-move",
      onMoveRequest,
      recurringEventsMovable: true,
    });
    const eventButton = screen.getByRole("button", { name: /recurring/u });

    fireEvent.dragStart(eventButton);
    fireEvent.drop(getTimedCell("10:00"));

    assert(onMoveRequest).toHaveBeenCalledOnce();
    assert(onMoveRequest.mock.calls[0]?.[0].event.recurrenceRule).toBe("FREQ=WEEKLY");
  });

  it("leaves a recurring event undraggable without recurringEventsMovable", () => {
    renderWeek({
      events: [{ ...timedEvent("recurring"), recurrenceRule: "FREQ=WEEKLY" }],
      interactionMode: "paint-and-move",
    });

    assert(document.querySelector('[data-event-id="recurring"]')).toHaveAttribute(
      "draggable",
      "false",
    );
  });

  it("keeps a drag alive when the browser cancels the pointer as the drag starts", () => {
    const onMoveRequest = vi.fn<() => void>();
    renderWeek({
      events: [event()],
      interactionMode: "paint-and-move",
      onMoveRequest,
    });
    const eventButton = screen.getByRole("button", { name: /Planning/u });
    const target = getTimedCell("13:00");

    // A real drag fires pointercancel and pointerleave right after dragstart.
    fireEvent.dragStart(eventButton);
    fireEvent.pointerCancel(eventButton);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    assert(onMoveRequest).toHaveBeenCalledOnce();
  });

  it("cancels a running paint when a drag of a non-actionable event is rejected", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();

    renderWeek({
      events: [event({ available: false, id: "blocked" })],
      interactionMode: "paint-and-move",
      onPaintSelect,
    });
    const button = screen.getByRole("button", { name: /Planning/u });

    fireEvent.pointerDown(getTimedCell("10:00"));
    fireEvent.dragStart(button);
    fireEvent.pointerCancel(button);
    fireEvent.pointerUp(getTimedCell("11:00"));

    assert(onPaintSelect).not.toHaveBeenCalled();
  });

  it("shows the ghost on the slot under a dragged event, without a drop-target outline", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    renderWeek({
      events: [timedEvent("drop-target")],
      interactionMode: "paint-and-move",
      onMoveRequest,
    });
    const eventButton = screen.getByRole("button", { name: /drop-target/u });
    const target = getTimedCell("10:00");

    act(() => {
      fireEvent.dragStart(eventButton);
      fireEvent.dragOver(target);
    });

    assert(target.querySelector("[data-drag-ghost]")).not.toBeNull();
    assert(document.querySelectorAll("[data-drop-target]")).toHaveLength(0);

    act(() => {
      fireEvent.drop(target);
    });

    assert(onMoveRequest).toHaveBeenCalledOnce();
    assert(document.querySelectorAll("[data-drop-target]")).toHaveLength(0);
  });

  it("shows a two-hour ghost from the pointer slot with no span outline", () => {
    renderWeek({
      events: [
        timedEvent({
          end: utcInstant("2026-08-24T12:00:00.000Z"),
          endTime: "12:00",
          id: "span",
          title: "span",
        }),
      ],
      interactionMode: "paint-and-move",
    });
    const eventButton = screen.getByRole("button", { name: /span/u });

    act(() => {
      fireEvent.dragStart(eventButton);
      fireEvent.dragOver(getTimedCell("10:00"));
    });

    assert(getTimedCell("10:00").querySelector("[data-drag-ghost]")).not.toBeNull();
    assert(document.querySelectorAll("[data-drop-target]")).toHaveLength(0);
  });

  it("emits the exact ordered paint range for reversed pointer travel", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      interactionMode: "paint-and-move",
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
    });
    const start = getTimedCell("11:00");
    const middle = getTimedCell("10:00");
    const end = getTimedCell("09:00");

    fireEvent.pointerDown(start);
    fireEvent.pointerMove(middle);
    fireEvent.pointerEnter(end);
    fireEvent.pointerUp(end);

    assert(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [cellAt("09:00"), cellAt("10:00"), cellAt("11:00")],
      end: cellAt("11:00"),
      start: cellAt("09:00"),
    });
  });

  it("does not start a paint from the +N tile", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderCappedWeek({
      events: crowdedNineAm,
      interactionMode: "paint-and-move",
      onPaintSelect,
    });
    const chip = screen.getByRole("button", { name: "+ 3 events" });

    fireEvent.pointerDown(chip);
    fireEvent.pointerUp(chip);

    assert(onPaintSelect).not.toHaveBeenCalled();
  });

  it("does not extend a paint over the +N tile", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderCappedWeek({
      events: crowdedNineAm,
      interactionMode: "paint-and-move",
      onPaintSelect,
    });
    const chip = screen.getByRole("button", { name: "+ 3 events" });

    fireEvent.pointerDown(getTimedCell("11:00"));
    fireEvent.pointerMove(chip);
    fireEvent.pointerUp(chip);

    assert(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [cellAt("11:00")],
      end: cellAt("11:00"),
      start: cellAt("11:00"),
    });
  });
});

describe("WeekGrid unit behaviour", () => {
  it("renders all-day spans, timed geometry, and a custom cell slot", () => {
    const renderCell = vi.fn<(context: CalendarCellContext) => ReactNode>(
      (context: CalendarCellContext) => (
        <span>Slot {context.cell.startTime}</span>
      )
    );

    renderWeek({
      events: [allDayEvent(), timedEvent("timed")],
      renderCell,
      t: (key) => key,
    });

    assert(screen.getByRole("button", { name: /All day/u })).toBeVisible();
    assert(screen.getByRole("button", { name: /timed/u })).toBeVisible();
    assert(screen.getAllByText(/Slot/u).length).toBeGreaterThan(0);
    assert(renderCell).toHaveBeenCalledWith(assert.anything());
  });

  it("shows an all-day chip with its title only, no time row", () => {
    renderWeek({ events: [allDayEvent()], t: (key) => key });

    const chip = screen.getByRole("button", { name: /All day/u });
    assert(chip.querySelector("[data-event-card-time]")).toBeNull();
  });

  it("emits a quick-create payload from an empty click with an anchor rectangle", async () => {
    const user = userEvent.setup();
    const onQuickCreate =
      vi.fn<(payload: CalendarQuickCreatePayload) => void>();
    renderWeek({ onQuickCreate, t: (key) => key });

    await user.click(getTimedCell("10:00"));

    const payload = requiredPayload(onQuickCreate.mock.calls[0]?.[0]);

    assert(payload.range.cells).toHaveLength(1);
    assert(payload.range.start.startTime).toBe(parseLocalTime("10:00"));
    assert(payload.anchorRect).toBeDefined();
  });

  it("renders custom event and conflict content with the typed context", () => {
    const renderEvent = vi.fn<
      (context: CalendarEventRenderContext<Payload>) => ReactNode
    >((context: CalendarEventRenderContext<Payload>) => (
      <span>Workshop {context.event.metadata?.itemId}</span>
    ));

    const renderConflict = vi.fn<
      (conflict: { readonly label: string }) => ReactNode
    >((conflict: { readonly label: string }) => (
      <span>Conflict {conflict.label}</span>
    ));

    renderWeek({
      events: [timedEvent("custom")],
      renderConflict,
      renderEvent,
      t: (key) => key,
    });

    assert(screen.getByText("Workshop ITEM-101")).toBeVisible();
    assert(screen.getByText("Conflict Room 1")).toBeVisible();
    assert(renderEvent).toHaveBeenCalledWith(
      assert.objectContaining({ event: timedEvent("custom") })
    );
    assert(renderConflict).toHaveBeenCalledWith(
      assert.objectContaining({ label: "Room 1" }),
      assert.objectContaining({ event: timedEvent("custom") })
    );
  });

  it("keeps a pending move until the host confirms it", () => {
    let request: CalendarMoveRequest | undefined;

    const onMoveRequest = vi.fn<(value: CalendarMoveRequest) => void>(
      (value: CalendarMoveRequest) => {
        request = value;
      }
    );

    renderWeek({
      events: [timedEvent("move")],
      interactionMode: "paint-and-move",
      onMoveRequest,
      t: (key) => key,
    });
    const button = screen.getByRole("button", { name: /move/u });

    act(() => {
      fireEvent.dragStart(button);
      fireEvent.drop(getTimedCell("10:00"));
    });

    assert(onMoveRequest).toHaveBeenCalledOnce();
    assert(request?.event.id).toBe("move");

    act(() => {
      request?.confirm();
    });
    assert(request?.from.startTime).toBe(parseLocalTime("09:00"));
    assert(request?.to.startTime).toBe(parseLocalTime("10:00"));
  });

  it("starts a move from the actual draggable event frame", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();

    renderWeek({
      events: [timedEvent("frame-move")],
      interactionMode: "paint-and-move",
      onMoveRequest,
      t: (key) => key,
    });

    const frame = document.querySelector<HTMLElement>(
      '[data-event-id="frame-move"][draggable="true"]'
    );

    if (frame === null) {
      throw new Error("Expected the event frame to be draggable");
    }

    assert(frame).toHaveAttribute("draggable", "true");

    const target = getTimedCell("10:00");
    act(() => {
      fireEvent.dragStart(frame);
      fireEvent.dragOver(target);
      fireEvent.drop(target);
    });

    assert(onMoveRequest).toHaveBeenCalledOnce();

    const request = onMoveRequest.mock.calls[0]?.[0];

    assert(request.event.id).toBe("frame-move");
    assert(request.confirm).toStrictEqual(assert.any(Function));

    act(() => {
      request.confirm();
    });
    assert(request.from.startTime).toBe(parseLocalTime("09:00"));
    assert(request.to.startTime).toBe(parseLocalTime("10:00"));
  });

  it("marks unavailable cells and events without allowing their activation", async () => {
    const user = userEvent.setup();
    const onEventSelect = vi.fn<() => void>();
    const onUnavailable = vi.fn<() => ReactNode>(() => <span>Busy slot</span>);
    renderWeek({
      events: [timedEvent("busy", false)],
      onEventSelect,
      renderUnavailable: onUnavailable,
      t: (key) => key,
    });
    const button = screen.getByRole("button", { name: /busy/u });

    assert(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);

    assert(onEventSelect).not.toHaveBeenCalled();
    assert(onUnavailable).toHaveBeenCalledWith(assert.anything());
  });

  it("leaves the busy event card to draw the busy state over its slot", () => {
    renderWeek({ events: [event({ available: false })], t: (key) => key });

    const slot = getTimedCell("09:00").querySelector(`.${styles.cellContent}`);

    assert(slot).toHaveClass(styles.unavailableSlot);
    assert(slot).not.toHaveClass(styles.unavailable);
  });

  it("renders a deterministic now marker from the injected instant", () => {
    renderWeek({
      now: utcInstant("2026-08-24T12:00:00.000Z"),
      t: (key) => key,
    });

    const marker = screen.getByRole("status", { name: /Current time/u });
    assert(marker).toBeVisible();
    assert(marker).toHaveTextContent("12:00");
  });

  it("keeps keyboard navigation on timed cells when non-timed cells are adjacent", async () => {
    const user = userEvent.setup();
    renderWeek({ t: (key) => key });

    const firstTimedCell = getTimedCell("00:00");
    firstTimedCell.focus();
    await user.keyboard("{ArrowUp}");

    assert(firstTimedCell).toHaveFocus();

    await user.keyboard("{Home}");

    assert(firstTimedCell).toHaveFocus();
  });

  it("moves keyboard focus in the RTL direction", async () => {
    const user = userEvent.setup();
    renderWeek({ direction: "rtl", t: (key) => key });
    const first = getTimedCell("09:00");

    const second = screen.getByRole("gridcell", {
      name: /Tuesday, August 25, 2026 09:00/u,
    });

    first.focus();
    await user.keyboard("{ArrowLeft}");

    assert(second).toHaveFocus();
  });

  it("does not emit create or paint callbacks in read-only mode", () => {
    const onQuickCreate = vi.fn<() => void>();
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      events: [timedEvent("read-only")],
      interactionMode: "read-only",
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
      onQuickCreate,
      t: (key) => key,
    });

    fireEvent.click(getTimedCell("10:00"));
    fireEvent.pointerDown(getTimedCell("11:00"));
    fireEvent.pointerUp(getTimedCell("12:00"));

    assert(onQuickCreate).not.toHaveBeenCalled();
    assert(onPaintSelect).not.toHaveBeenCalled();
  });

  it("closes the composed detail slot without requiring host mutation", async () => {
    const user = userEvent.setup();
    renderWeek({
      events: [timedEvent("detail")],
      renderDetail: ({ event: detailEvent, close: closePanel }) => (
        <aside aria-label="Detail">
          {detailEvent.title}
          <button type="button" onClick={closePanel}>
            Close
          </button>
        </aside>
      ),
      selectedEventId: "detail",
      t: (key) => key,
    });

    const detail = screen.getByRole("complementary", { name: "Detail" });

    assert(detail).toHaveTextContent("detail");

    await user.click(within(detail).getByRole("button", { name: "Close" }));

    assert(screen.queryByRole("complementary", { name: "Detail" })).toBeNull();
  });

  it("cancels pointer interactions at the surface boundary and ignores non-cell targets", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      interactionMode: "paint-and-move",
      onPaintSelect: (range) => {
        onPaintSelect(range);
      },
      t: (key) => key,
    });

    const grid = screen.getByRole("grid");
    const surface = grid;

    const allDayCell = screen.getByRole("gridcell", {
      name: /Monday, August 24, 2026 All-day events/u,
    });
    const timedCell = getTimedCell("09:00");

    fireEvent.click(surface);
    fireEvent.pointerMove(surface);
    fireEvent.pointerDown(surface);
    fireEvent.pointerDown(allDayCell);
    fireEvent.pointerDown(timedCell);
    fireEvent.pointerEnter(surface);
    fireEvent.pointerLeave(surface);
    fireEvent.pointerCancel(surface);
    fireEvent.pointerUp(surface);
    fireEvent.dragOver(surface);
    fireEvent.drop(surface);
    fireEvent.dragEnd(surface);

    assert(onPaintSelect).not.toHaveBeenCalled();
  });

  it("announces keyboard focus changes and guards custom event key activation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));

    const onEventSelect = vi.fn<() => void>();
    renderWeek({
      events: [timedEvent("custom")],
      interactionMode: "read-only",
      onEventSelect,
      renderEvent: (context) => <span>{context.event.title}</span>,
      t: (key) => key,
    });

    const firstCell = getTimedCell("09:00");
    act(() => {
      firstCell.focus();
    });
    act(() => {
      fireEvent.keyDown(firstCell, { key: "ArrowDown" });
    });

    const eventButton = screen.getByRole("button", { name: "custom" });
    act(() => {
      fireEvent.keyDown(eventButton, { key: "Escape" });
      fireEvent.keyDown(eventButton, { key: "Enter", repeat: true });
    });
    act(() => {
      fireEvent.keyDown(eventButton, { key: "Enter" });
      vi.advanceTimersByTime(60_000);
    });

    assert(onEventSelect).toHaveBeenCalledOnce();
    assert(screen.getByText(/Week view/u)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("ignores malformed unavailable events without crashing the grid", () => {
    const malformed = timedEvent("malformed", false);
    Object.defineProperty(malformed, "start", { value: "not-an-instant" });

    renderWeek({ events: [malformed], t: (key) => key });

    assert(screen.getByRole("grid")).toBeVisible();
  });

  it("cancels a drag when the host surface receives a non-cell drop", () => {
    const onMoveRequest = vi.fn<() => void>();
    renderWeek({
      events: [timedEvent("drag-cancel")],
      interactionMode: "paint-and-move",
      onMoveRequest,
      t: (key) => key,
    });

    const button = screen.getByRole("button", { name: /drag-cancel/u });
    const grid = screen.getByRole("grid");
    const surface = grid;

    fireEvent.dragStart(button);
    fireEvent.dragOver(surface);
    fireEvent.drop(surface);

    assert(onMoveRequest).not.toHaveBeenCalled();
  });
});

const NO_WEEK_EVENTS: readonly CalendarEvent<Payload>[] = [];

describe("WeekGrid ordinary grid rendering", () => {
  it("keeps the week canvas rendered for empty input with no special regions", () => {
    const { rerender } = renderWeek({ events: NO_WEEK_EVENTS });

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(
      <WeekGrid
        date={DATE}
        events={NO_WEEK_EVENTS}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
      />
    );

    assert(screen.getByRole("grid")).toBeVisible();
    assert(screen.queryByRole("alert")).not.toBeInTheDocument();
    assert(
      within(screen.getByRole("grid")).getAllByRole("gridcell").length
    ).toBeGreaterThan(0);
  });

  it("leaves no empty state wrapper behind once the week has events", () => {
    renderWeek({ events: [timedEvent("settled")] });

    assert(screen.getByRole("grid")).toBeInTheDocument();
  });
});

describe("WeekGrid drag feedback", () => {
  const draggableFrame = (id: string): HTMLElement => {
    const frame = document.querySelector<HTMLElement>(
      `[data-event-id="${id}"][draggable="true"]`
    );

    if (frame === null) {
      throw new Error(`Expected ${id} to be draggable`);
    }

    return frame;
  };

  it("shows the dragged card at its size and width in the target slot and dims the source", () => {
    renderWeek({
      events: [timedEvent("ghost")],
      interactionMode: "paint-and-move",
    });
    const frame = draggableFrame("ghost");
    const target = getTimedCell("11:00");

    act(() => {
      fireEvent.dragStart(frame);
      fireEvent.dragOver(target);
    });

    const ghost = target.querySelector<HTMLElement>("[data-drag-ghost]");
    assert(frame).toHaveAttribute("data-dragging");
    assert(document.querySelectorAll("[data-drop-target]")).toHaveLength(0);
    assert(ghost).toHaveAttribute("aria-hidden", "true");
    assert(ghost?.textContent).toMatch(/ghost/u);
    assert(ghost?.textContent).toMatch(/11:00/u);
    assert(ghost?.style.blockSize).toBe(frame.style.blockSize);
    assert(ghost?.style.inlineSize).toMatch(/%$/u);
    assert(ghost?.style.inlineSize).toBe(frame.style.inlineSize);
    assert(ghost?.style.insetInlineStart).toBe(frame.style.insetInlineStart);
  });

  it("clears the ghost, the outline and the dimming when the drop lands", () => {
    const onMoveRequest = vi.fn<(request: CalendarMoveRequest) => void>();
    renderWeek({
      events: [timedEvent("dropped")],
      interactionMode: "paint-and-move",
      onMoveRequest,
    });
    const frame = draggableFrame("dropped");
    const target = getTimedCell("11:00");

    act(() => {
      fireEvent.dragStart(frame);
      fireEvent.dragOver(target);
      fireEvent.drop(target);
    });

    assert(onMoveRequest).toHaveBeenCalledOnce();
    assert(document.querySelector("[data-drag-ghost]")).toBeNull();
    assert(document.querySelector("[data-drop-target]")).toBeNull();
    assert(frame).not.toHaveAttribute("data-dragging");
  });

  it("replaces the native drag image with a transparent one", () => {
    const setDragImage = vi.fn<(image: Element, x: number, y: number) => void>();
    renderWeek({
      events: [timedEvent("native")],
      interactionMode: "paint-and-move",
    });
    const button = screen.getByRole("button", { name: /native/u });

    fireEvent.dragStart(button, { dataTransfer: { setDragImage } });

    assert(setDragImage).toHaveBeenCalledExactlyOnceWith(
      assert.any(HTMLImageElement),
      0,
      0
    );
  });

  it("does not make a recurring event draggable until the occurrence-or-series choice exists", () => {
    renderWeek({
      events: [
        { ...timedEvent("series"), recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" },
      ],
      interactionMode: "paint-and-move",
    });

    assert(document.querySelector('[data-event-id="series"]')).toHaveAttribute(
      "draggable",
      "false"
    );
  });

  it("keeps an event the host marks movable: false in place, and still opens it", () => {
    const onEventSelect = vi.fn<() => void>();
    renderWeek({
      events: [{ ...timedEvent("pinned"), movable: false }],
      interactionMode: "paint-and-move",
      onEventSelect,
    });

    assert(document.querySelector('[data-event-id="pinned"]')).toHaveAttribute(
      "draggable",
      "false"
    );

    fireEvent.click(screen.getByRole("button", { name: /pinned/u }));

    assert(onEventSelect).toHaveBeenCalledOnce();
  });
});

describe("WeekGrid paint colour family", () => {
  it("paints the drag-create selection in the host colour family", () => {
    renderWeek({
      interactionMode: "paint-and-move",
      paintColorFamily: "blue",
    });

    fireEvent.pointerDown(getTimedCell("09:00"));
    fireEvent.pointerMove(getTimedCell("10:00"));

    assert(
      document.querySelectorAll('[data-paint][data-color-family="blue"]')
    ).toHaveLength(2);

    fireEvent.pointerUp(getTimedCell("10:00"));
  });

  it("leaves painted cells without a colour family when none is set", () => {
    renderWeek({ interactionMode: "paint-and-move" });

    fireEvent.pointerDown(getTimedCell("09:00"));
    fireEvent.pointerMove(getTimedCell("10:00"));

    assert(document.querySelectorAll("[data-paint]")).toHaveLength(2);
    assert(document.querySelectorAll("[data-color-family]")).toHaveLength(0);

    fireEvent.pointerUp(getTimedCell("10:00"));
  });
});

describe("WeekGrid paint refusal", () => {
  const busyEvent = () => ({ ...timedEvent("busy"), available: false });

  it("paints the focused cell on Enter in paint-and-move mode", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({ interactionMode: "paint-and-move", onPaintSelect });
    const cell = getTimedCell("09:00");

    act(() => {
      cell.focus();
    });
    fireEvent.keyDown(cell, { key: "Enter" });

    assert(onPaintSelect).toHaveBeenCalledExactlyOnceWith({
      cells: [cellAt("09:00")],
      end: cellAt("09:00"),
      start: cellAt("09:00"),
    });
  });

  it("marks a paint over unavailable time invalid, and a release opens the dialog without painting", async () => {
    const user = userEvent.setup();
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    renderWeek({
      events: [busyEvent()],
      interactionMode: "paint-and-move",
      onPaintSelect,
    });

    fireEvent.pointerDown(getTimedCell("11:00"));
    fireEvent.pointerMove(getTimedCell("09:00"));

    assert(document.querySelectorAll("[data-invalid]").length).toBeGreaterThan(
      0
    );

    fireEvent.pointerUp(getTimedCell("09:00"));

    assert(onPaintSelect).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");

    assert(
      within(dialog).getByText("Overlaps an unavailable period")
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(document.querySelector("[data-paint]")).toBeNull();
  });

  it("keeps a finished paint when unavailable time arrives under it", () => {
    const onPaintSelect = vi.fn<(range: CalendarSelectionRange) => void>();
    const { rerender } = renderWeek({
      interactionMode: "paint-and-move",
      onPaintSelect,
    });

    fireEvent.pointerDown(getTimedCell("09:00"));
    fireEvent.pointerMove(getTimedCell("10:00"));
    fireEvent.pointerUp(getTimedCell("10:00"));

    rerender(
      <WeekGrid
        date={DATE}
        events={[busyEvent()]}
        timeZone={UTC}
        locale="en-US"
        t={t}
        direction="ltr"
        interactionMode="paint-and-move"
        onPaintSelect={onPaintSelect}
      />
    );
    fireEvent.pointerUp(getTimedCell("14:00"));

    assert(screen.queryByRole("alertdialog")).toBeNull();
    assert(document.querySelector("[data-paint]")).not.toBeNull();
    assert(onPaintSelect).toHaveBeenCalledOnce();
  });
});
