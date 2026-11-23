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
