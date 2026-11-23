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
