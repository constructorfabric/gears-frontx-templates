# AvailabilityGrid

`AvailabilityGrid` renders host-owned availability cells and exposes paint interactions as an ordered, serializable `CalendarSelectionRange`.

```tsx
<AvailabilityGrid
  cells={cells}
  locale="en-US"
  timeZone={timeZone}
  direction="ltr"
  t={t}
  onPaintSelect={(range) => setDraftRange(range)}
/>
```

The host supplies each `CalendarAvailabilityCell`; the kit does not fetch or interpret host data. Available cells can be painted with pointer or keyboard input. Blocked cells remain navigable but cannot start, extend, or commit a selection. Set `interactionMode="read-only"` to preserve navigation while disabling selection.

`selectedRange` and `onSelectedRangeChange` form the controlled contract. Use `defaultSelectedRange` for uncontrolled usage. `renderCell` receives the standard `CalendarCellContext` plus `available` and the cell's host `state` id, which the kit passes through without interpreting it.

`paintMode="cells"` paints only the cells a drag passes, and earlier painting stays. The default `span` paints everything between the two drag ends in time order and replaces the previous range.

`rowHeight` sets the height of one row in pixels; the default is `43`. It must be a positive finite number, or render throws a `RangeError`, as on `WeekGrid`.

`addAvailabilityCells(range, cells)` is exported from the package root. It returns the union of a `CalendarSelectionRange` and extra cells, sorted by start time, or `null` when the union is empty. Use it to add cells to a host range without rebuilding the range by hand.

`showHourLabels` draws each row's start time beside both edges of the grid. `onHourClick` makes those labels buttons and receives every cell of that hour; `onDayClick` makes the column headers buttons and receives every cell of that day. The kit only reports the cells; the host decides what a click means. `headerFormat="weekday"` shows day names without dates; the default `date` keeps the weekday and date.

An empty `cells` collection renders the grid structure with no rows and says "No time slots" (`calendar.availability.empty`) under it. The kit does not create loading or error shells, alerts, or status regions; multi-step-flow and fetch-state presentation remains host-owned.

The component is intentionally independent of host-flow orchestration: a host that embeds a planning flow owns its steps, access rules, persistence, and any confirmation UI, and may use `onPaintSelect` to map the returned range into its own request model. No host-specific imports are required.

The root accepts `className`; styles use the calendar theme aliases and include focus-visible, dark-theme, reduced-motion, and forced-colors support.

## Props

<!-- generated:props AvailabilityGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `cells` | `readonly CalendarAvailabilityCell[]` | yes | Host availability decisions, one per slot. |
| `className` | `string` |  | Class added to the component root. |
| `defaultSelectedRange` | `CalendarSelectionRange` |  | Initial painted range when uncontrolled. |
| `headerFormat` | `"date" \| "weekday"` |  | Column header text: `date` (default) shows the weekday and date, `weekday` only the weekday. |
| `interactionMode` | `"paint" \| "read-only"` |  | `read-only` keeps navigation but disables painting. Default `paint`. |
| `onDayClick` | `(columnCells: readonly CalendarAvailabilityCell[]) => void` |  | Makes the column headers buttons. Receives every cell of that day. |
| `onHourClick` | `(rowCells: readonly CalendarAvailabilityCell[]) => void` |  | Makes the hour labels buttons. Receives every cell of that row. |
| `onPaintSelect` | `(range: CalendarSelectionRange) => void` |  | Called once when a paint gesture is committed. |
| `onSelectedRangeChange` | `(range: CalendarSelectionRange \| null) => void` |  | Called when the painted range changes or clears. |
| `paintMode` | `"span" \| "cells"` |  | `span` (default) paints everything between the drag ends; `cells` paints only the cells a drag passes and keeps earlier painting. |
| `renderCell` | `(context: CalendarCellContext & { readonly available: boolean; readonly state: string \| u…` |  | Replaces cell content. The context adds the cell's `available` flag and host `state`. |
| `rowHeight` | `number` |  | Height of one row in pixels. Default `43`. |
| `selectedRange` | `CalendarSelectionRange` |  | Controlled painted range. |
| `showHourLabels` | `boolean` |  | Draws each row's start time beside both edges of the grid. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.availability -->

| Translation ID                     | English                | Values |
| ---------------------------------- | ---------------------- | ------ |
| `calendar.availability.empty`      | No time slots          |        |
| `calendar.availability.label`      | Availability           |        |
| `calendar.availability.selectDay`  | Select all of {{day}}  | `day`  |
| `calendar.availability.selectHour` | Select all at {{time}} | `time` |

<!-- /generated -->

## Related

- [WeekGrid](../week-grid/week-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
