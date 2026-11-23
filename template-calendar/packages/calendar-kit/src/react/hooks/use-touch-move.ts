import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";

import type { CalendarCell } from "../../core/model";

const holdMs = 350;
const slopPx = 10;

export interface UseTouchMoveOptions {
  /** Starts the move for the pressed event; `false` when it cannot move. */
  readonly begin: (eventId: string, target: EventTarget) => boolean;
  /** Receives the pressed target so callers can hit-test in the root that holds it (shadow roots). */
  readonly cellAt: (clientX: number, clientY: number, pressed: EventTarget) => CalendarCell | null;
  readonly update: (cell: CalendarCell) => void;
  readonly end: () => void;
  readonly cancel: () => void;
}

/**
 * Touch does not fire HTML5 drag events, so a finger moves an event by holding it, then
 * dragging. Moving before the hold ends leaves the gesture to scrolling.
 */
export const useTouchMove = (options: UseTouchMoveOptions) => {
  const optionsRef = useRef(options);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    []
  );

  return (pointer: PointerEvent<HTMLElement>, eventId: string): void => {
    if (pointer.pointerType !== "touch") {
      return;
    }

    stopRef.current?.();
    const { clientX, clientY, target } = pointer;
    let armed = false;

    const timer = window.setTimeout(() => {
      armed = optionsRef.current.begin(eventId, target);
    }, holdMs);

    const preventScroll = (touch: TouchEvent): void => {
      if (armed) {
        touch.preventDefault();
      }
    };
    const move = (next: globalThis.PointerEvent): void => {
      if (armed) {
        const cell = optionsRef.current.cellAt(next.clientX, next.clientY, target);

        if (cell !== null) {
          optionsRef.current.update(cell);
        }
      } else if (
        Math.hypot(next.clientX - clientX, next.clientY - clientY) > slopPx
      ) {
        stop();
      }
    };
    const up = (): void => {
      const wasArmed = armed;
      stop();

      if (wasArmed) {
        optionsRef.current.end();
      }
    };
    const cancel = (): void => {
      const wasArmed = armed;
      stop();

      if (wasArmed) {
        optionsRef.current.cancel();
      }
    };
    const escape = (key: KeyboardEvent): void => {
      if (key.key === "Escape") {
        cancel();
      }
    };

    const stop = (): void => {
      window.clearTimeout(timer);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", preventScroll);
      document.removeEventListener("keydown", escape);
      armed = false;
      stopRef.current = null;
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", preventScroll, { passive: false });
    document.addEventListener("keydown", escape);
    stopRef.current = stop;
  };
};
