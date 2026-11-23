# E1: Conflict week

A dense week from 08:00 to 18:00. Cards show two metadata rows. Overlaps sit in narrow columns. A conflict card has a red frame. The toolbar holds a version select, filters and a sync action.

Parts: `CalendarToolbar`, `WeekGrid`.
Props: `renderLeading`, `renderTrailing`, `renderEventMetadata`, `getEventFrameProps`, `renderHeader`, `visibleHours`.

<!-- generated:example demo/examples/recipes/e01-conflict-week.tsx -->

```tsx
// demo/examples/recipes/e01-conflict-week.tsx
import { CalendarToolbar, WeekGrid, calendarDate, parseLocalTime } from "@gears-frontx/calendar-kit";

import { isWeekend, timedEvent } from "./recipe-fixtures";

// Stands in for the host's navigation handlers, which move `currentDate` in real use.
const noop = () => undefined;

const events = [
  timedEvent({ colorFamily: "violet", date: "2026-09-21", end: "10:00", id: "e1", location: "Hall 2", start: "08:00", title: "Workshop A" }),
  timedEvent({ colorFamily: "violet", date: "2026-09-21", end: "10:00", id: "e2", location: "Hall 3", start: "08:00", title: "Workshop B" }),
];

export function ConflictWeek() {
  return (
    <>
      <CalendarToolbar
        currentDate={calendarDate("2026-09-21")}
        onNext={noop}
        onPrevious={noop}
        onToday={noop}
        onViewChange={noop}
        renderLeading={() => <select aria-label="Version" />}
        renderTrailing={() => <button type="button">Sync</button>}
      />
      <WeekGrid
        date={calendarDate("2026-09-21")}
        events={events}
        getEventFrameProps={({ event }) =>
          event.id === "e2"
            ? { className: "conflict-card", "data-tone": "conflict" }
            : undefined
        }
        renderEventMetadata={({ event }) => <span>{event.location}</span>}
        renderHeader={({ date, weekday, dayNumber }) =>
          date && isWeekend(date) ? (
            <span className="weekend">{`${weekday} ${dayNumber}`}</span>
          ) : (
            `${weekday} ${dayNumber}`
          )
        }
        visibleHours={{ end: parseLocalTime("18:00"), start: parseLocalTime("08:00") }}
      />
    </>
  );
}
```

<!-- /generated -->

Rules:

- `getEventFrameProps` returns `className` and `data-tone` for the whole card. Set the red hatch in host CSS on that class or tone. Do not set `outline` on the frame, because the focus ring owns it.
- A weekend column stays in the grid. Grey the weekend header in `renderHeader` and leave the cells empty.
- Toolbar controls are host markup. `renderLeading` and `renderTrailing` place them in the bar.
