# S4: Weekly hours with breaks

A weekday-only week from 06:00 to 21:00, with 15-minute slots, hour labels on both sides and breaks drawn as host bands.

Parts: `WeekGrid`.
Props: `visibleDays`, `visibleHours`, `slotMinutes`, `trailingGutter`, `renderHeader`, `timeRanges`, `renderTimeRange`.

<!-- generated:example demo/examples/recipes/s04-weekly-hours.tsx -->

```tsx
// demo/examples/recipes/s04-weekly-hours.tsx
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
```

<!-- /generated -->

Rules:

- `visibleDays={5}` shows Monday to Friday. `7` shows the whole week.
- `slotMinutes` takes 5, 10, 15, 20, 30 or 60.
- `timeRanges` bands sit behind timed events and are clipped to `visibleHours`. Without `renderTimeRange` no band is drawn.
- Do not add a second background layer beside `timeRanges` or `workingHours`.
- `renderHeader` replaces the weekday and day number. Keep the `columnheader` role on the header cell.
