# S3: Month view with a range

A month with events and a selected date range. Multi-day events draw as bars across the days they cover.

Parts: `MonthGrid`.
Props: `events`, `selectionMode="date-range"`, `selectedDateRange`, `onSelectedDateRangeChange`.

<!-- generated:example demo/examples/recipes/s03-month-view.tsx -->

```tsx
// demo/examples/recipes/s03-month-view.tsx
import { useState } from "react";

import { MonthGrid, calendarDate } from "@gears-frontx/calendar-kit";
import type { CalendarDateRange, CalendarEvent } from "@gears-frontx/calendar-kit";

import { allDayEvent } from "./recipe-fixtures";

const events: readonly CalendarEvent[] = [
  allDayEvent({
    endDate: "2026-08-27",
    id: "fair",
    startDate: "2026-08-24",
    title: "Career fair",
  }),
];

export function MonthWithRange() {
  const [range, setRange] = useState<CalendarDateRange | null>({
    end: calendarDate("2026-08-26"),
    start: calendarDate("2026-08-24"),
  });

  return (
    <MonthGrid
      date={calendarDate("2026-08-01")}
      events={events}
      onSelectedDateRangeChange={setRange}
      selectedDateRange={range}
      selectionMode="date-range"
    />
  );
}
```

<!-- /generated -->

Rules:

- An all-day event has an exclusive `endDate` and `null` times. A one-day event on the 24th ends on the 25th.
- A range drag can start on an empty day and continue over event chips. It cannot start on a chip.
- A range is one contiguous set of days. For a non-contiguous set, the host draws its own state through `getCellState`.
