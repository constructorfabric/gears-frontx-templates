import { EventCard, WeekGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
} from "@gears-frontx/calendar-kit";

import type { ItemMetadata } from "./map-host-events";

const ItemCard = (context: CalendarEventRenderContext<ItemMetadata>) => (
  <EventCard<ItemMetadata>
    event={context.event}
    segment={context.segment}
    geometry={context.geometry}
    positioned={false}
    selected={context.isSelected}
    past={context.isPast}
    readOnly={context.isReadOnly}
    renderMetadata={({ event }) => {
      const itemId = event.metadata?.itemId ?? null;

      return itemId === null ? null : <span>{itemId}</span>;
    }}
  />
);

export const ItemWeek = ({
  date,
  events,
}: {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent<ItemMetadata>[];
}) => (
  <WeekGrid<ItemMetadata>
    date={date}
    events={events}
    renderEvent={ItemCard}
  />
);
