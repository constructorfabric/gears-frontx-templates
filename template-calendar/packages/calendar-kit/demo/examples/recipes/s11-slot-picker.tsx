import { useState } from "react";

import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarAvailabilityCell,
  CalendarSelectionRange,
} from "@gears-frontx/calendar-kit";

import { hourCells } from "./recipe-fixtures";

// `state` is host data. The kit passes it to renderCell and does not read it.
const cells: CalendarAvailabilityCell[] = hourCells("2026-09-21", 8, 19).map(
  (cell, index) => ({
    ...cell,
    state: index % 3 === 0 ? "tight" : "available",
  })
);

export function SlotPicker() {
  const [selected, setSelected] = useState<CalendarSelectionRange | null>(null);

  return (
    <>
      <AvailabilityGrid
        cells={cells}
        onSelectedRangeChange={setSelected}
        paintMode="cells"
        renderCell={({ state }) => (
          <span className={`chip chip-${state ?? "none"}`}>
            {state === "tight" ? "Tight" : "Available"}
          </span>
        )}
        selectedRange={selected}
      />
      <button type="button" onClick={() => setSelected(null)}>
        Cancel
      </button>
    </>
  );
}
