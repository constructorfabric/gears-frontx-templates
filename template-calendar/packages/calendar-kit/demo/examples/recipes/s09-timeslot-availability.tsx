import { useState } from "react";

import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type { CalendarSelectionRange } from "@gears-frontx/calendar-kit";

import { hourCells } from "./recipe-fixtures";

// The kit has no disclosure primitive, so the host uses native details.
export function TimeslotAvailability() {
  const [selected, setSelected] = useState<CalendarSelectionRange | null>(null);

  return (
    <details open>
      <summary>Ana Lee</summary>
      <AvailabilityGrid
        cells={hourCells("2026-09-21", 9, 17)}
        onSelectedRangeChange={setSelected}
        paintMode="cells"
        selectedRange={selected}
      />
    </details>
  );
}
