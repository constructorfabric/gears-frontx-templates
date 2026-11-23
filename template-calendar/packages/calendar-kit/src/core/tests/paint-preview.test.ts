import { describe, expect, it } from "vitest";
import { UTC } from "../../__test-utils__/fixtures";
import type { CalendarCell } from "../model";
import { calendarDate, parseLocalTime, utcInstant } from "../model";
import { buildPaintPreviewBlocks } from "../paint-preview";

const hourCell = (day: string, hour: number): CalendarCell => ({
  date: calendarDate(day),
  end: utcInstant(`${day}T${String(hour + 1).padStart(2, "0")}:00:00.000Z`),
  endTime: parseLocalTime(`${String(hour + 1).padStart(2, "0")}:00`),
  start: utcInstant(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`),
  startTime: parseLocalTime(`${String(hour).padStart(2, "0")}:00`),
});

describe("buildPaintPreviewBlocks", () => {
  it("returns no block when nothing is painted", () => {
    expect(buildPaintPreviewBlocks([], UTC, "en-US")).toEqual([]);
  });

  it("labels a single-day paint with the viewer-time range and the painted row count", () => {
    const blocks = buildPaintPreviewBlocks(
      [hourCell("2026-08-24", 15), hourCell("2026-08-24", 16)],
      UTC,
      "en-US"
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe("15:00 – 17:00");
    expect(blocks[0]?.rowCount).toBe(2);
    expect(blocks[0]?.start).toEqual(hourCell("2026-08-24", 15));
  });

  it("splits a multi-day paint into one run per date", () => {
    const blocks = buildPaintPreviewBlocks(
      [
        hourCell("2026-08-24", 20),
        hourCell("2026-08-24", 21),
        hourCell("2026-08-25", 0),
        hourCell("2026-08-25", 1),
      ],
      UTC,
      "en-US"
    );

    expect(blocks.map((block) => [block.label, block.rowCount])).toEqual([
      ["20:00 – 22:00", 2],
      ["00:00 – 02:00", 2],
    ]);
  });
});
