# E3: Event detail in a side sheet

Event detail as a right-hand sheet with a header, tag chips, label and value rows and dividers. The kit draws the detail content. The host draws the sheet frame and the tags.

Parts: `EventDetailContent`, `EventDetailSection`, `EventDetailRow`, `EventDetailDivider`.
Props: `event`, `onClose`, `readOnly`, `renderActions`, `renderMetadata`, `renderHeader`.

<!-- generated:example demo/examples/recipes/e03-event-detail-sheet.tsx -->

```tsx
// demo/examples/recipes/e03-event-detail-sheet.tsx
import {
  EventDetailContent,
  EventDetailDivider,
  EventDetailRow,
  EventDetailSection,
} from "@gears-frontx/calendar-kit";
import type { CalendarEvent } from "@gears-frontx/calendar-kit";

interface SheetProps {
  readonly event: CalendarEvent;
  readonly onClose: () => void;
  readonly onDelete: (event: CalendarEvent) => void;
}

// The host draws the sheet and its header. The kit draws the detail content inside it.
export function EventDetailSheet({ event, onClose, onDelete }: SheetProps) {
  return (
    <aside aria-label={event.title}>
      <EventDetailContent
        event={event}
        onClose={onClose}
        readOnly
        renderActions={(current) => (
          <button type="button" onClick={() => onDelete(current)}>
            Delete
          </button>
        )}
        renderMetadata={(current) => (
          <>
            <EventDetailDivider />
            <EventDetailSection>
              <EventDetailRow label="Location">{current.location}</EventDetailRow>
            </EventDetailSection>
            <EventDetailDivider />
            <EventDetailSection>
              <EventDetailRow label="Notes">Bring a laptop.</EventDetailRow>
            </EventDetailSection>
          </>
        )}
      />
    </aside>
  );
}
```

<!-- /generated -->

Rules:

- `EventDetailContent` takes the same props as `EventDetailPanel`. The host decides when to render it and draws the sheet around it.
- `renderActions` replaces the kit's edit and delete buttons. Wire the host handlers into them. A red Delete is a host button with a host class.
- Rows and dividers are plain parts. `EventDetailRow` takes `label` and children. `EventDetailSection` groups rows.
