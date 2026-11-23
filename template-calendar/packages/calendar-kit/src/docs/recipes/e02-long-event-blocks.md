# E2: Long event blocks

A week with long event blocks. Each card shows a bold title and one secondary line that joins the location and the time. The toolbar holds the primary action.

Parts: `CalendarToolbar`, `WeekGrid`, `EventCard`.
Props: `renderEvent`, `renderTitle`, `renderTime`, `renderMetadata`, `renderTrailing`, `renderHeader`.

<!-- generated:example demo/examples/recipes/e02-long-event-blocks.tsx -->

```tsx
// demo/examples/recipes/e02-long-event-blocks.tsx
import { CalendarToolbar, EventCard, WeekGrid, calendarDate } from "@gears-frontx/calendar-kit";

import { isWeekend, timedEvent } from "./recipe-fixtures";

// Stands in for the host's navigation handlers, which move `currentDate` in real use.
const noop = () => undefined;

const events = [
  timedEvent({ colorFamily: "orange", date: "2026-09-21", end: "13:00", id: "x1", location: "Sports Complex", start: "08:00", title: "Swim meet" }),
];

export function LongEventWeek() {
  return (
    <>
      <CalendarToolbar
        currentDate={calendarDate("2026-09-21")}
        onNext={noop}
        onPrevious={noop}
        onToday={noop}
        onViewChange={noop}
        renderTrailing={() => <button type="button">Add event</button>}
      />
      <WeekGrid
        date={calendarDate("2026-09-21")}
        events={events}
        renderEvent={(context) => (
          <EventCard
            {...context}
            renderMetadata={({ event }) => (
              <span>{`${event.location ?? ""} · ${event.startTime}-${event.endTime}`}</span>
            )}
            renderTime={() => null}
          />
        )}
        renderHeader={({ date, weekday, dayNumber }) => (
          <span className={date && isWeekend(date) ? "weekend" : undefined}>
            {`${weekday} ${dayNumber}`}
          </span>
        )}
      />
    </>
  );
}
```

<!-- /generated -->

Rules:

- The orange block and its left bar come from `colorFamily`.
- `renderTime={() => null}` removes the time row and its clock icon, so the joined line carries the time.
- Filters and the Add event action are host markup in the toolbar slots or above the bar.
