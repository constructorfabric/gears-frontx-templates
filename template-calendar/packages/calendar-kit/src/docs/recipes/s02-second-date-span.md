# S2: Second date span

The same date-span picker as S1, with a different colour for the selection. Use it for a second kind of range that sits on the same month view.

Parts: `MonthGrid`.
Props: as S1.

<!-- generated:example demo/examples/recipes/s02-second-date-span.tsx -->

```tsx
// demo/examples/recipes/s02-second-date-span.tsx
import { useState } from "react";

import { MonthGrid, calendarDate } from "@gears-frontx/calendar-kit";
import type { CalendarDateRange } from "@gears-frontx/calendar-kit";

// Host CSS on `.second-span` sets the purple selection tokens for this subtree.
export function SecondSpanPicker() {
  const [range, setRange] = useState<CalendarDateRange | null>(null);

  return (
    <div className="second-span">
      <MonthGrid
        date={calendarDate("2026-09-01")}
        events={[]}
        onSelectedDateRangeChange={setRange}
        selectedDateRange={range}
        selectionMode="date-range"
        trailingGutter
        weekNumbering={{ startDate: calendarDate("2026-09-08") }}
      />
    </div>
  );
}
```

<!-- /generated -->

Rules:

- The colour comes from host CSS on a wrapper. Set the `--cal-*` selection tokens on the wrapper class. Do not target kit class names.
- A token set on a wrapper reaches every descendant that reads it, so keep the wrapper to the month grid only.
