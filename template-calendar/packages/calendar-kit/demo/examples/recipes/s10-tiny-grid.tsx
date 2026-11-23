import { AvailabilityGrid } from "@gears-frontx/calendar-kit";

import { hourCells } from "./recipe-fixtures";

// Two day columns, three rows. Blocked cells are `available: false`.
const cells = [
  ...hourCells("2026-09-21", 9, 12),
  ...hourCells("2026-09-22", 9, 12).map((cell, index) => ({
    ...cell,
    available: index !== 1,
  })),
];

export function TinyGrid() {
  return (
    <AvailabilityGrid
      cells={cells}
      headerFormat="weekday"
      interactionMode="read-only"
      rowHeight={24}
    />
  );
}
