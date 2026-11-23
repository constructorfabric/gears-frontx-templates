import { describe, expect as assert, it } from "vitest";

import { layoutTimedEvents } from "../layout";
import { utcInstant } from "../model";
import { capSegmentsPerSlot } from "../slot-overflow";

describe("capSegmentsPerSlot", () => {
  const segments = [
    { id: "late", start: utcInstant("2026-09-14T09:30:00.000Z"), slot: "a" },
    { id: "early", start: utcInstant("2026-09-14T09:00:00.000Z"), slot: "a" },
    { id: "middle", start: utcInstant("2026-09-14T09:10:00.000Z"), slot: "a" },
    { id: "other", start: utcInstant("2026-09-14T10:00:00.000Z"), slot: "b" },
  ];

  it("keeps the earliest segments of each slot and counts the rest", () => {
    const { hiddenBySlot, visible } = capSegmentsPerSlot(segments, (segment) => segment.slot, 2);

    assert(visible.map((segment) => segment.id)).toStrictEqual(["early", "middle", "other"]);
    assert([...hiddenBySlot]).toStrictEqual([["a", 1]]);
  });

  it("keeps every segment when no cap is set", () => {
    const { hiddenBySlot, visible } = capSegmentsPerSlot(segments, (segment) => segment.slot, undefined);

    assert(visible).toHaveLength(4);
    assert(hiddenBySlot.size).toBe(0);
  });

  it("rejects a cap that is not a positive integer", () => {
    assert(() => capSegmentsPerSlot(segments, (segment) => segment.slot, 0)).toThrow(RangeError);
  });
});

describe("trailing layout items", () => {
  it("take the lane after the events that start at the same instant", () => {
    const geometry = layoutTimedEvents([
      { end: utcInstant("2026-09-14T10:00:00.000Z"), id: "tile", start: utcInstant("2026-09-14T09:00:00.000Z"), trailing: true },
      { end: utcInstant("2026-09-14T10:00:00.000Z"), id: "card", start: utcInstant("2026-09-14T09:00:00.000Z") },
    ]);

    assert(geometry.find((item) => item.id === "card")?.left).toBe(0);
    assert(geometry.find((item) => item.id === "tile")?.left).toBe(49);
  });
});
