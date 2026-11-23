# S6: Resource availability

Paint free hours for each day. The host sends one cell per hour and receives the painted range.

Parts: `AvailabilityGrid`.
Props: `cells`, `paintMode="cells"`, `selectedRange`, `onSelectedRangeChange`, `headerFormat="date"`, `showHourLabels`, `renderCell`.

<!-- generated:example demo/examples/recipes/s06-resource-availability.tsx -->

```tsx
// demo/examples/recipes/s06-resource-availability.tsx
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
```

<!-- /generated -->

Rules:

- `paintMode="cells"` paints only the cells the drag passes and keeps earlier paint. `paintMode="span"` paints everything between the drag ends.
- A cell with `available: false` cannot be painted and draws as unavailable.
- `renderCell` gets the cell's `available` flag and host `state`. Check and fill belong in `renderCell`, not in a second layer.
- Reset is host state: set `selectedRange` to `null`.
