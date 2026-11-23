# E5: Event detail in the side panel

The event detail panel in the host's side panel, with a two-line title, edit, delete, close, time zone and description.

Parts: `EventDetailPanel`.
Props: `event`, `open`, `onOpenChange`, `onClose`, `onEdit`, `onDelete`, `renderActions`, `renderMetadata`.

<!-- generated:example demo/examples/recipes/e05-event-detail-side-panel.tsx -->

```tsx
// demo/examples/recipes/e05-event-detail-side-panel.tsx
import { useState } from "react";

import { EventDetailPanel } from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

interface Props {
  readonly event: CalendarEvent;
}

// The host places this panel in its side panel and passes `open`. The panel
// keeps its own edit, delete and close controls.
export function EventDetailSidePanel({ event }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <EventDetailPanel
      event={event}
      onDelete={(target) => {
        void target;
      }}
      onEdit={(target) => {
        void target;
      }}
      onClose={() => setOpen(false)}
      onOpenChange={setOpen}
      open={open}
      renderActions={() => <button type="button">Delete</button>}
      renderMetadata={(current) => <span>{current.location}</span>}
    />
  );
}
```

<!-- /generated -->

Rules:

- `EventDetailPanel` is controlled by `open`. It renders inline; the kit draws no popover, dialog or anchored position.
- The host places the panel in its side panel and owns the open state. `onClose` runs from the close button and Escape.
- `renderActions` replaces the edit and delete buttons, so the host sets the delete look.
