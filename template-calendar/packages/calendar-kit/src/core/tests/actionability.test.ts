import { describe, expect as assert, it } from "vitest";

import { isEventMovable, isRecurringEvent } from "../actionability";

describe("event movability", () => {
  it("treats blank and whitespace recurrence rules as not recurring", () => {
    assert(isRecurringEvent({ recurrenceRule: null })).toBe(false);
    assert(isRecurringEvent({ recurrenceRule: "" })).toBe(false);
    assert(isRecurringEvent({ recurrenceRule: "   " })).toBe(false);
    assert(isRecurringEvent({ recurrenceRule: "FREQ=WEEKLY" })).toBe(true);
  });

  it("blocks moves for recurring events", () => {
    assert(isEventMovable({ recurrenceRule: "FREQ=DAILY" })).toBe(false);
  });

  it("moves recurring events when the grid opts in, unless the host pins them", () => {
    assert(isEventMovable({ recurrenceRule: "FREQ=DAILY" }, true)).toBe(true);
    assert(
      isEventMovable({ movable: false, recurrenceRule: "FREQ=DAILY" }, true)
    ).toBe(false);
  });

  it("blocks moves when the host sets movable to false", () => {
    assert(isEventMovable({ movable: false, recurrenceRule: null })).toBe(false);
  });

  it("allows moves for one-off events that are movable by default", () => {
    assert(isEventMovable({ recurrenceRule: null })).toBe(true);
    assert(isEventMovable({ movable: true, recurrenceRule: null })).toBe(true);
  });
});
