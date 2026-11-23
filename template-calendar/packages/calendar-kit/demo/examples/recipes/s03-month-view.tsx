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
