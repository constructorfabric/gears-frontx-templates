import { WeekGrid, calendarDate, parseLocalTime } from "@gears-frontx/calendar-kit";
import type { CalendarTimeRange } from "@gears-frontx/calendar-kit";

// Breaks are host bands drawn behind events. Hatching comes from `.break` in host CSS.
const breaks: readonly CalendarTimeRange[] = [
  { end: parseLocalTime("10:15"), key: "break-am", start: parseLocalTime("10:00") },
  { end: parseLocalTime("14:15"), key: "break-pm", start: parseLocalTime("14:00") },
];

export function WeeklyHours() {
  return (
    <WeekGrid
      date={calendarDate("2026-09-21")}
      events={[]}
      renderHeader={({ date, weekday, dayNumber }) =>
        date ? `${weekday} ${dayNumber}` : null
      }
      renderTimeRange={() => <span className="break" />}
      slotMinutes={15}
      timeRanges={breaks}
      trailingGutter
      visibleDays={5}
      visibleHours={{ end: parseLocalTime("21:00"), start: parseLocalTime("06:00") }}
    />
  );
}
