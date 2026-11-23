# S8: Timeslot hours

Allowed hours for a resource. A click on an hour label or a day header adds that row or column to the painted set.

Parts: `AvailabilityGrid`, `addAvailabilityCells`.
Props: `onHourClick`, `onDayClick`, `onSelectedRangeChange`, `selectedRange`, `paintMode="cells"`.

<!-- generated:example demo/examples/recipes/s08-timeslot-hours.tsx -->

```tsx
// demo/examples/recipes/s08-timeslot-hours.tsx
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
```

<!-- /generated -->

Rules:

- `addAvailabilityCells(range, cells)` returns the union of the painted range and the added cells. It accepts `null` as the empty range.
- The kit has no unpaint by drag or click in `cells` mode. Escape clears the whole range. To remove hours, the host builds the next range without them.
