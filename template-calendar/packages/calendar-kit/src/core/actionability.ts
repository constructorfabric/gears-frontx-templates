import type { CalendarEvent } from "./model";

export type EventActionabilityInput = Pick<
  CalendarEvent,
  "available" | "access"
>;

export type EventActionBlocker = "busy-access" | "unavailable";

/** Why an event cannot be moved or opened, or `null` when it can; busy access wins. */
export const eventActionBlocker = (
  event: EventActionabilityInput,
  availableOverride?: boolean
): EventActionBlocker | null => {
  if (event.access === "busy") {
    return "busy-access";
  }

  return (availableOverride ?? event.available ?? true) ? null : "unavailable";
};

export const isEventActionable = (
  event: EventActionabilityInput,
  availableOverride?: boolean
): boolean => eventActionBlocker(event, availableOverride) === null;
