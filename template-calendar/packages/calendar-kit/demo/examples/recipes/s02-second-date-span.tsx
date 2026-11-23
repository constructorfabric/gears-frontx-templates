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
