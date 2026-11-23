import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

import { arrayAt } from "../../core/array";
import type {
  CalendarCell,
  CalendarEvent,
  CalendarResizeRequest,
  IanaTimeZone,
} from "../../core/model";
import { utcInstant } from "../../core/model";
import { compareUtcInstants, toViewerDateTime } from "../../core/temporal";

const QUARTER_HOUR_MILLISECONDS = 15 * 60 * 1000;

/** The slot under the pointer and the screen positions of its top and bottom edges. */
export interface ResizeTarget {
  readonly cell: CalendarCell;
  readonly top: number;
  readonly bottom: number;
}

export interface ResizePreview {
  readonly eventId: string;
  /** Height the card takes while the pointer is down, in pixels. */
  readonly blockSize: number;
}

export interface UseEventResizeOptions {
  /** `handle` is the grip being dragged, for grids that look the slot up from their own element. */
  readonly targetAt: (
    clientX: number,
    clientY: number,
    handle: HTMLElement
  ) => ResizeTarget | null;
  /** Timed slots of the grid, which the keyboard steps through. */
  readonly cells: readonly CalendarCell[];
  readonly timeZone: IanaTimeZone;
  readonly onResizeRequest?: (request: CalendarResizeRequest) => void;
}

interface ActiveResize {
  readonly event: CalendarEvent;
  readonly top: number;
  to: CalendarCell | null;
}

/** A new end must leave the event at least one slot long. */
const endsAfterStart = (event: CalendarEvent, cell: CalendarCell): boolean =>
  !event.allDay && compareUtcInstants(cell.end, event.start) > 0;

const endsWhereEventEnds = (event: CalendarEvent, cell: CalendarCell): boolean =>
  !event.allDay && compareUtcInstants(cell.end, event.end) === 0;

interface QuarterEnd {
  /** The new end, as a cell that ends on the quarter hour. */
  readonly cell: CalendarCell;
  /** Screen position of that end. */
  readonly bottom: number;
}

/** The pointer's time in the slot, rounded to the nearest quarter hour and kept inside the slot. */
const quarterEndInSlot = (
  target: ResizeTarget,
  clientY: number,
  timeZone: IanaTimeZone
): QuarterEnd => {
  const { cell, top, bottom } = target;
  const startMs = Date.parse(cell.start);
  const endMs = Date.parse(cell.end);
  const pointerMs =
    startMs + ((clientY - top) / (bottom - top)) * (endMs - startMs);
  const quarterMs =
    Math.round(pointerMs / QUARTER_HOUR_MILLISECONDS) * QUARTER_HOUR_MILLISECONDS;
  const endedMs = Math.min(Math.max(quarterMs, startMs), endMs);
  const end = utcInstant(new Date(endedMs));

  return {
    bottom: top + ((endedMs - startMs) / (endMs - startMs)) * (bottom - top),
    cell: { ...cell, end, endTime: toViewerDateTime(end, timeZone).time },
  };
};

/** The slot ending one step after (`1`) or before (`-1`) the event's end, on the event's own day. */
const stepEnd = (
  cells: readonly CalendarCell[],
  event: CalendarEvent,
  step: 1 | -1
): CalendarCell | null => {
  if (event.allDay) {
    return null;
  }

  const sameDay = cells.filter((cell) => cell.date === event.startDate);

  if (step === 1) {
    return sameDay.find((cell) => compareUtcInstants(cell.end, event.end) > 0) ?? null;
  }

  return (
    arrayAt(
      sameDay.filter((cell) => compareUtcInstants(cell.end, event.end) < 0),
      -1
    ) ?? null
  );
};

export const useEventResize = ({
  targetAt,
  cells,
  timeZone,
  onResizeRequest,
}: UseEventResizeOptions) => {
  const [preview, setPreview] = useState<ResizePreview | null>(null);
  const activeRef = useRef<ActiveResize | null>(null);

  const clear = (): void => {
    activeRef.current = null;
    setPreview(null);
  };

  const request = (event: CalendarEvent, to: CalendarCell): void => {
    if (
      onResizeRequest === undefined ||
      !endsAfterStart(event, to) ||
      endsWhereEventEnds(event, to)
    ) {
      clear();
      return;
    }

    onResizeRequest({ cancel: clear, confirm: clear, event, to });
  };

  const handleProps = (event: CalendarEvent) => ({
    onKeyDown: (keyboard: KeyboardEvent<HTMLElement>): void => {
      if (
        !keyboard.altKey ||
        (keyboard.key !== "ArrowDown" && keyboard.key !== "ArrowUp")
      ) {
        return;
      }

      keyboard.preventDefault();
      const to = stepEnd(
        cells,
        event,
        keyboard.key === "ArrowDown" ? 1 : -1
      );

      if (to !== null) {
        request(event, to);
      }
    },
    // Stops the browser from starting a drag of the card the handle sits in.
    onMouseDown: (mouse: MouseEvent<HTMLElement>): void => {
      mouse.preventDefault();
    },
    onPointerCancel: clear,
    onPointerDown: (pointer: PointerEvent<HTMLElement>): void => {
      const frame = pointer.currentTarget.parentElement;

      pointer.stopPropagation();

      if (frame === null || pointer.button !== 0) {
        return;
      }

      pointer.currentTarget.setPointerCapture(pointer.pointerId);
      activeRef.current = {
        event,
        to: null,
        top: frame.getBoundingClientRect().top,
      };
    },
    onPointerMove: (pointer: PointerEvent<HTMLElement>): void => {
      pointer.stopPropagation();
      const active = activeRef.current;
      const target =
        active === null
          ? null
          : targetAt(pointer.clientX, pointer.clientY, pointer.currentTarget);

      if (active === null || target === null) {
        return;
      }

      const quarterEnd = quarterEndInSlot(target, pointer.clientY, timeZone);

      if (!endsAfterStart(active.event, quarterEnd.cell)) {
        return;
      }

      active.to = quarterEnd.cell;
      setPreview({
        blockSize: quarterEnd.bottom - active.top,
        eventId: active.event.id,
      });
    },
    onPointerUp: (pointer: PointerEvent<HTMLElement>): void => {
      pointer.stopPropagation();
      const active = activeRef.current;
      activeRef.current = null;

      if (active?.to) {
        request(active.event, active.to);
      } else {
        clear();
      }
    },
  });

  return { handleProps, preview };
};
