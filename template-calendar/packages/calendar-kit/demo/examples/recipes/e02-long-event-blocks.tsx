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
