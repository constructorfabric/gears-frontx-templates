import { useState } from "react";

import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type { CalendarSelectionRange } from "@gears-frontx/calendar-kit";

import { hourCells } from "./recipe-fixtures";

// Only the hours a person checked are passed as cells, so the rest stay unpainted.
const personCells = hourCells("2026-09-21", 9, 12);

export function PersonAvailability() {
  const [selected, setSelected] = useState<CalendarSelectionRange | null>(null);

  return (
    <AvailabilityGrid
      cells={personCells}
      headerFormat="weekday"
      onSelectedRangeChange={setSelected}
      paintMode="cells"
      selectedRange={selected}
      showHourLabels
    />
  );
}
