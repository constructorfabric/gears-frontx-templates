# S5: Week with rich cards

A week where each card shows metadata rows, such as a location, an organiser or an event type.

Parts: `WeekGrid`, `EventCard`.
Props: `events`, `renderEventMetadata`.

<!-- generated:example demo/examples/recipes/s05-week-rich-cards.tsx -->

```tsx
// demo/examples/recipes/s05-week-rich-cards.tsx
import { WeekGrid, calendarDate } from "@gears-frontx/calendar-kit";

import { timedEvent } from "./recipe-fixtures";

const events = [
  timedEvent({
    date: "2026-09-21",
    end: "11:00",
    id: "lab",
    location: "Room 3",
    start: "09:00",
    title: "Planning session",
  }),
];

// Rows use the host's data. Icons come from the host, not the kit.
export function RichCardsWeek() {
  return (
    <WeekGrid
      date={calendarDate("2026-09-21")}
      events={events}
      renderEventMetadata={({ event }) => (
        <span>{event.location ?? "No room"}</span>
      )}
    />
  );
}
```

<!-- /generated -->

Rules:

- The default card already shows location, organiser and type rows. Use `renderEventMetadata` only when the rows must change.
- Icons inside the rows are host markup. The kit draws no icons on custom rows.
- `renderEventMetadata` must not add interactive content. The card itself is the focus target.
