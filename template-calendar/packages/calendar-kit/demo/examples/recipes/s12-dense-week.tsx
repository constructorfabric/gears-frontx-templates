import { useState } from "react";

import {
  CalendarToolbar,
  WeekGrid,
  calendarDate,
  parseLocalTime,
} from "@gears-frontx/calendar-kit";
import type { CalendarCell } from "@gears-frontx/calendar-kit";

import { timedEvent } from "./recipe-fixtures";

// Stands in for the host's navigation handlers, which move `currentDate` in real use.
const noop = () => undefined;

const events = [
  timedEvent({ date: "2026-09-21", end: "10:00", id: "a", start: "08:00", title: "Algebra" }),
  timedEvent({ date: "2026-09-21", end: "10:00", id: "b", start: "08:00", title: "Physics" }),
  timedEvent({ date: "2026-09-21", end: "10:00", id: "c", start: "08:00", title: "Planning" }),
];

export function DenseWeek() {
  // The +N chip reports its cell. The host lists the hidden cards for that cell.
  const [overflowCell, setOverflowCell] = useState<CalendarCell | null>(null);

  return (
    <>
      <CalendarToolbar
        currentDate={calendarDate("2026-09-21")}
        onNext={noop}
        onPrevious={noop}
        onToday={noop}
        onViewChange={noop}
        renderLeading={() => <select aria-label="Version" />}
        renderTrailing={() => <button type="button">Sync</button>}
      />
      <WeekGrid
        date={calendarDate("2026-09-21")}
        events={events}
        maxEventsPerSlot={2}
        onOverflowSelect={(cell) => setOverflowCell(cell)}
        renderEventMetadata={({ event }) => <span>{event.title}</span>}
        renderOverflow={(hidden) => `+${hidden}`}
        rowHeight={43}
        slotMinutes={15}
        visibleHours={{
          end: parseLocalTime("18:00"),
          start: parseLocalTime("08:00"),
        }}
      />
      {overflowCell ? <p>{`Hidden cards at ${overflowCell.startTime}`}</p> : null}
    </>
  );
}
