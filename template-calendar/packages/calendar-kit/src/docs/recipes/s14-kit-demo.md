# S14: Kit demo card

An `EventCard` on its own, with custom metadata, for a side panel or a list.

Parts: `EventCard`.
Props: `event`, `renderMetadata`, `renderTitle`, `renderTime`.

<!-- generated:example demo/examples/recipes/s14-kit-demo.tsx -->

```tsx
// demo/examples/recipes/s14-kit-demo.tsx
import { EventCard } from "@gears-frontx/calendar-kit";

import { timedEvent } from "./recipe-fixtures";

const event = timedEvent({
  colorFamily: "violet",
  date: "2026-09-21",
  end: "11:00",
  id: "demo",
  location: "Room 2",
  start: "09:00",
  title: "Design review",
});

// EventCard works standalone. Inside WeekGrid, use renderEventMetadata instead.
export function KitDemoCard() {
  return (
    <EventCard
      event={event}
      renderMetadata={() => <span>Room 2</span>}
    />
  );
}
```

<!-- /generated -->

Rules:

- Inside `WeekGrid` or `MonthGrid`, pass metadata with `renderEventMetadata`. `EventCard` on its own uses `renderMetadata`.
- Colour comes from `colorFamily` and the `--cal-*` tokens. Do not read colours from hex values.
