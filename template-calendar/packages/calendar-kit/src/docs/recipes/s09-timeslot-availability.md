# S9: Timeslot availability

One availability grid per person inside a collapsible section.

Parts: `AvailabilityGrid`.
Props: as S6. The collapse is host markup.

<!-- generated:example demo/examples/recipes/s09-timeslot-availability.tsx -->

```tsx
// demo/examples/recipes/s09-timeslot-availability.tsx
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
```

<!-- /generated -->

Rules:

- The kit has no disclosure primitive. Use native `<details>` and `<summary>`.
- Each grid keeps its own `selectedRange`. Two grids on one page must not share state.
