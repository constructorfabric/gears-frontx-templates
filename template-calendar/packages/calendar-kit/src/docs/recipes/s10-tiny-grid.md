# S10: Tiny grid

A compact read-only grid with two day columns and three rows. Blocked cells are drawn grey.

Parts: `AvailabilityGrid`.
Props: `cells`, `headerFormat`, `interactionMode="read-only"`, `rowHeight`.

<!-- generated:example demo/examples/recipes/s10-tiny-grid.tsx -->

```tsx
// demo/examples/recipes/s10-tiny-grid.tsx
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
```

<!-- /generated -->

Rules:

- `interactionMode="read-only"` keeps keyboard navigation and disables painting.
- `rowHeight` sets the row height in pixels. The default is 43.
- The layout around the grid is host markup.
