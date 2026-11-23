# S1: Date span

Pick a date range inside one month, for example 8 to 26 September. Days outside the span are blocked. The host keeps the range and clears it on demand.

Parts: `MonthGrid`.
Props: `selectionMode="date-range"`, `selectedDateRange`, `onSelectedDateRangeChange`, `getCellState`, `weekNumbering` (`{ startDate }`), `trailingGutter`.

<!-- generated:example demo/examples/recipes/s01-date-span.tsx -->

```tsx
// demo/examples/recipes/s01-date-span.tsx
import { useState } from "react";

import { MonthGrid, calendarDate } from "@gears-frontx/calendar-kit";
import type { CalendarDateRange } from "@gears-frontx/calendar-kit";

const startDate = calendarDate("2026-09-08");
const endDate = calendarDate("2026-09-26");

const isOutsideSpan = (date: string): boolean =>
  date < startDate || date > endDate;

export function DateSpanPicker() {
  const [range, setRange] = useState<CalendarDateRange | null>(null);

  return (
    <>
      <button type="button" onClick={() => setRange(null)}>
        Clear
      </button>
      <MonthGrid
        date={calendarDate("2026-09-01")}
        events={[]}
        getCellState={(cell) =>
          isOutsideSpan(cell.date) ? { unavailable: true } : undefined
        }
        onSelectedDateRangeChange={setRange}
        selectedDateRange={range}
        selectionMode="date-range"
        trailingGutter
        weekNumbering={{ startDate }}
      />
    </>
  );
}
```

<!-- /generated -->

Rules:

- `selectedDateRange={null}` is controlled and empty. `undefined` is uncontrolled.
- `getCellState` marks a day `unavailable`, which blocks it visually. The day stays in the range, so the host removes it when it saves the range.
- Relative week numbers need `weekNumbering={{ startDate }}`. The default is `"month"`.
- Memoize `getCellState` when it depends on host data. It runs for every cell on each render.
