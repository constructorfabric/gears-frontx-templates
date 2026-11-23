import { useState } from "react";

import {
  AvailabilityGrid,
  addAvailabilityCells,
} from "@gears-frontx/calendar-kit";
import type { CalendarSelectionRange } from "@gears-frontx/calendar-kit";

import { hourCells } from "./recipe-fixtures";

const cells = hourCells("2026-09-21", 8, 18);

export function TimeslotHours() {
  const [selected, setSelected] = useState<CalendarSelectionRange | null>(null);

  // Clicking an hour label or day header adds that slice to the painted set.
  const addRows = (rowCells: readonly (typeof cells)[number][]) =>
    setSelected((range) => addAvailabilityCells(range, rowCells));

  return (
    <AvailabilityGrid
      cells={cells}
      onDayClick={addRows}
      onHourClick={addRows}
      onSelectedRangeChange={setSelected}
      paintMode="cells"
      selectedRange={selected}
      showHourLabels
    />
  );
}
