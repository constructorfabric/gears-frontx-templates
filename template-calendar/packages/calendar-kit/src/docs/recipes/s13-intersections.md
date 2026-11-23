# S13: Intersections

Variable-height coloured blocks that show a status. Each block is a timed event, and the host decides its colour and icons.

Parts: `WeekGrid`.
Props: `events`, `renderEvent`, `renderEventMetadata`, `onEventSelect`, `rowHeight`.

<!-- generated:example demo/examples/recipes/s13-intersections.tsx -->

```tsx
// demo/examples/recipes/s13-intersections.tsx
import { WeekGrid, calendarDate } from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

import { timedEvent } from "./recipe-fixtures";

// Each intersection block is a timed event. The host's state field drives its colour.
const blocks: readonly CalendarEvent[] = [
  timedEvent({ colorFamily: "orange", date: "2026-09-21", end: "12:00", id: "i1", start: "09:00", title: "Open" }),
  timedEvent({ colorFamily: "green", date: "2026-09-21", end: "15:00", id: "i2", start: "13:00", title: "Full" }),
];

// `busy` events are inert. Use `access: "full"` when a block must open its detail.
export function Intersections() {
  return (
    <WeekGrid
      date={calendarDate("2026-09-21")}
      events={blocks}
      onEventSelect={(event) => {
        void event;
      }}
      renderEvent={({ event }) => <span>{event.title}</span>}
      renderEventMetadata={({ event }) => <span>{event.colorFamily}</span>}
      rowHeight={24}
    />
  );
}
```

<!-- /generated -->

Rules:

- `busy` events are inert: no selection and no drag. A block that opens a detail needs `access: "full"`.
- `available: false` makes an event unavailable and ignores activation.
- The kit has no per-event state field. Map the host state to `colorFamily` or to a class in `renderEvent`.
