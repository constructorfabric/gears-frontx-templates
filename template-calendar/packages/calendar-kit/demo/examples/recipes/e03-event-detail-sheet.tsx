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
