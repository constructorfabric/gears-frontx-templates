import { AvailabilityGrid } from "@gears-frontx/calendar-kit";
import type {
  CalendarAvailabilityCell,
  CalendarSelectionRange,
} from "@gears-frontx/calendar-kit";
import { useState } from "react";

export const AvailabilityPicker = ({
  cells,
}: {
  readonly cells: readonly CalendarAvailabilityCell[];
}) => {
  const [range, setRange] = useState<CalendarSelectionRange | null>(null);

  return (
    <>
      <AvailabilityGrid
        cells={cells}
        selectedRange={range ?? undefined}
        onSelectedRangeChange={setRange}
      />
      {range !== null && (
        <p>
          {range.start.date} {range.start.startTime}–{range.end.endTime} (
          {range.cells.length} slots)
        </p>
      )}
    </>
  );
};
