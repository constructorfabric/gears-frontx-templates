# S7: Person availability

The S6 grid with sparse data. Each person has cells only for the hours they are free.

Parts: `AvailabilityGrid`.
Props: as S6. Use `headerFormat="weekday"` when the column shows only the weekday.

<!-- generated:example demo/examples/recipes/s07-person-availability.tsx -->

```tsx
// demo/examples/recipes/s07-person-availability.tsx
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
```

<!-- /generated -->

Rules:

- Build `cells` from host data in one place. Keep one grid per person.
- The grid paints only the cells it gets. Hours with no cell are not paintable.
