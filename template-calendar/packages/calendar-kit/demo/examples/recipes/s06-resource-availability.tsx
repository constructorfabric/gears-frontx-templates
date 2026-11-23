import { useState } from "react";

import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type { CalendarSelectionRange } from "@gears-frontx/calendar-kit";

import { hourCells } from "./recipe-fixtures";

const cells = [
  ...hourCells("2026-09-21", 8, 18),
  ...hourCells("2026-09-22", 8, 18),
];

export function ResourceAvailability() {
  const [selected, setSelected] = useState<CalendarSelectionRange | null>(null);

  return (
    <>
      <AvailabilityGrid
        cells={cells}
        headerFormat="date"
        onSelectedRangeChange={setSelected}
        paintMode="cells"
        selectedRange={selected}
        showHourLabels
      />
      <button type="button" onClick={() => setSelected(null)}>
        Reset
      </button>
    </>
  );
}
