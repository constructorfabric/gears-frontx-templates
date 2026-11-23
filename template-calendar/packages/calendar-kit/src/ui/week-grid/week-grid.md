# WeekGrid

`WeekGrid` renders a host-supplied five- or seven-day week with all-day spans, timed event geometry, overlap lanes, the current-time marker and an accessible low-level `CalendarGrid` surface.

## Usage

```tsx
import { WeekGrid } from "@gears-frontx/calendar-kit/week-grid";

<WeekGrid
  date={weekDate}
  events={events}
  visibleDays={5}
  interactionMode="quick-create"
  locale="en-US"
  timeZone={viewerTimeZone}
  direction="ltr"
  t={t}
  now={now}
  onQuickCreate={({ range, anchorRect }) => openCreate(range, anchorRect)}
  renderEvent={(context) => context.event.title}
/>;
```

## Props

<!-- generated:props WeekGridProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `CalendarDate` | yes | Any day in the week to show. The week starts on Monday. |
| `events` | `readonly CalendarEvent<Payload>[]` | yes | Events to lay out. Only the ones overlapping the visible week are drawn. |
| `cellClassName` | `string` |  | Class added to every day cell. |
| `className` | `string` |  | Class added to the component root. |
| `columnHeaderClassName` | `string` |  | Class added to every day header. |
| `defaultInteractionMode` | `WeekGridInteractionMode` |  | Initial interaction mode when uncontrolled. |
| `defaultSelectedEventId` | `string` |  | Initial selected event when uncontrolled. |
| `getCellState` | `(cell: CalendarCell) => CalendarCellState \| undefined` |  | Host state per cell. `unavailable` blocks the cell; it stays focusable. |
| `getEventFrameProps` | `(context: CalendarEventRenderContext<Payload>) => EventFrameHookProps \| undefined` |  | Class and `data-tone` for the event's card frame, so host CSS can mark a state such as a conflict or a busy block. No inline style: the kit keeps the focus outline out of reach. |
| `gutterClassName` | `string` |  | Class on every gutter label: hours, all-day, zone and the trailing copy. |
| `interactionMode` | `WeekGridInteractionMode` |  | Controlled interaction mode. Default `quick-create`. |
| `maxEventsPerSlot` | `number` |  | Most cards that start in one row of a day. Later ones hide behind a `+N` lane tile. |
| `now` | `UtcInstant` |  | Reference instant for the now line and past styling. Default: the wall clock, per minute. |
| `onEventSelect` | `(event: CalendarEvent<Payload>, context: CalendarEventRenderContext<Payload>, anchor?: HT…` |  | An available event was activated; `anchor` is the card, for a detail popover. |
| `onInteractionModeChange` | `(mode: WeekGridInteractionMode) => void` |  | Called when the grid asks to change mode. |
| `onMoveRequest` | `(request: CalendarMoveRequest) => void` |  | An event was dropped on a new slot in `paint-and-move` mode. Call `confirm` or `cancel`. |
| `onOverflowSelect` | `(cell: CalendarCell, anchor: HTMLElement) => void` |  | The `+N` tile was activated. `anchor` is the tile, for a popover. |
| `onPaintSelect` | `(range: CalendarSelectionRange) => void` |  | A range was painted in `paint-and-move` mode. |
| `onQuickCreate` | `(payload: CalendarQuickCreatePayload) => void` |  | An empty slot was activated in `quick-create` mode. |
| `onResizeRequest` | `(request: CalendarResizeRequest) => void` |  | A resize handle on timed, single-day, movable events asks the host to move the event's end. |
| `onSelectedEventIdChange` | `(eventId: string \| null) => void` |  | Called when an event is selected or deselected. |
| `paintColorFamily` | `CalendarColorFamily` |  | Colour family of a painted range. Unset, the painted cells use the plain selection style. |
| `recurringEventsMovable` | `boolean` |  | Lets recurring events be dragged and resized. The requests carry the event, so the host picks occurrence or series. |
| `renderCell` | `(context: CalendarCellContext) => ReactNode` |  | Replaces the content of each empty time cell. |
| `renderConflict` | `CalendarConflictRenderer` |  | Replaces how each conflict renders inside the default card. |
| `renderDetail` | `CalendarDetailRenderer<Payload>` |  | Renders an inline detail for the selected event. Receives `close`. |
| `renderEvent` | `CalendarEventRenderer<Payload>` |  | Replaces the default `EventCard` for timed and all-day events. Renders inside a button, so the content must not be interactive. |
| `renderEventMetadata` | `CalendarEventRenderer<Payload>` |  | Replaces the metadata rows (location, organizer, type) of the default `EventCard`. |
| `renderHeader` | `(column: WeekGridHeaderColumn) => ReactNode` |  | Replaces the weekday and day number of each day header. The time column keeps its label. |
| `renderOverflow` | `(hiddenCount: number, cell: CalendarCell) => ReactNode` |  | Replaces the text of the `+N` tile. Receives the hidden count. |
| `renderTimeRange` | `(range: CalendarTimeRange<unknown>, context: { readonly geometry: CalendarEventGeometry; …` |  | Renders the content of each band in `timeRanges`. Without it no band is drawn. |
| `renderUnavailable` | `(cell: CalendarCell) => ReactNode` |  | Drawn in cells covered by an unavailable or busy timed event, or in cells `getCellState` marks unavailable. |
| `rowHeight` | `number` |  | Height of one row in pixels. Default `43`. |
| `selectedEventId` | `string` |  | Controlled selected event. |
| `slotMinutes` | `CalendarSlotMinutes` |  | Length of one row. Default `60`. |
| `timeRanges` | `readonly CalendarTimeRange<unknown>[]` |  | Host bands drawn behind the timed events. Clipped to `visibleHours`. A band must start before it ends on the same day; overnight or empty bands (e.g. 22:00 to 02:00) are skipped and not drawn. An end of `00:00` means end of day. |
| `trailingGutter` | `boolean` |  | Repeat the hour labels on the trailing edge. The copy is hidden from assistive technology. |
| `visibleDays` | `5 \| 7` |  | `5` shows Monday–Friday, `7` the whole week. Default `5`. |
| `visibleHours` | `CalendarTimeWindow` |  | Visible hours, e.g. `{ start: "06:00", end: "23:00" }`, on slot boundaries. Default: all. |
| `workingHours` | `CalendarTimeWindow` |  | Working hours; cells outside them are hatched. Also where the grid first scrolls to. Default 08:00–18:00. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Time axis

`visibleHours?: CalendarTimeWindow` limits the timed grid to part of the day, for example `{ start: "06:00", end: "23:00" }`. The end is exclusive, and `"00:00"` as the end means the end of the day. The default is the whole day.

`slotMinutes?: 15 | 20 | 30 | 60` sets the length of one row; the default is `60`. The gutter labels only rows that start on the hour. `visibleHours` snaps outward to whole slots: the start rounds down and the end rounds up. An empty or reversed window throws a `RangeError`.

`workingHours?: CalendarTimeWindow` sets the working part of the day; the default is 08:00–18:00. Cells outside it are not hatched (the day grid hatches them); their accessible name says "non-working hour". It is independent of `visibleHours` and also sets where the grid first scrolls to.

Events are clipped to the visible hours, and events wholly outside them are not rendered. The now line is hidden while the current time is outside them. The now line draws over event cards, and its time label is an opaque pill, and the gutter hour label it would overlap is hidden. Slots follow elapsed time, so a daylight-saving day has one slot fewer or more.

`timeRanges?: CalendarTimeRange[]` adds host bands (breaks, holds, blocked hours) drawn behind the events. Each band is `{ key, start, end, date?, metadata? }`; an `end` of `00:00` means the end of the day, and minutes are kept. `date` limits a band to one day; omitted, it draws on every visible day. Bands are clipped to `visibleHours` and drawn only when `renderTimeRange` is set. `renderTimeRange(range, { geometry })` returns the band's content. The band is `aria-hidden` and takes no pointer input, so put anything users must read in an event or the host UI. A band whose `end` is at or before its `start` on its day (for example an overnight `22:00` to `02:00`) is skipped and not drawn; it does not throw.

## Trailing gutter and part classes

`trailingGutter` repeats the hour labels on the trailing edge, as timetable views do. The copy is hidden from assistive technology, so the grid is announced once, and it follows `direction`.

`cellClassName`, `columnHeaderClassName`, and `gutterClassName` add host classes to the day cells, the day header, and every gutter label (hour rows, the all-day label, the header zone label, and the trailing copy). They are the stable styling hooks for these parts; the kit's own CSS Module class names are internal. Style by state (selected, unavailable) through `renderCell`, which receives it.

## Cell state and day headers

`getCellState(cell)` returns `{ state?, unavailable? }` per time cell, or `undefined`. `unavailable: true` draws the cell blocked, on top of the cells covered by unavailable or busy events, and sets `isUnavailable` in `renderCell`. The cell stays focusable. `state` reaches `renderCell` and the cell's `data-state` attribute. Cells in a paint range carry `isRangeStart` and `isRangeEnd` on the first and last cell of each run within one day column. Memoize `getCellState`, because it runs for every cell on each render.

`renderHeader(column)` replaces the weekday and day number of each day header. `column.date` is the day the column shows, and it is `undefined` only for the time column, which keeps its label. Use it for a greyed weekend or a closed-day header; the cell keeps `role="columnheader"`, so keep the content inside it.

## Interaction modes

- `quick-create` activates an empty timed cell by click or Enter/Space and emits `onQuickCreate`. Available events emit `onEventSelect(event, context, anchor)`, where `anchor` is the activated card element.
- `paint-and-move` paints an ordered range through pointer gestures and emits `onPaintSelect`. Enter or Space on an empty timed cell paints that one cell. `paintColorFamily` colours the painted cells; unset, they use the plain selection style. A paint that covers unavailable time is marked invalid; releasing it opens an info dialog and emits nothing. Dragging an available event emits `onMoveRequest`; the host must call `confirm` or `cancel` on the request. No move is committed by the component before confirmation. While the drag is over another slot, the target slot shows a ghost card at the event's height and title, above every card. The source card dims, and the browser's drag image is blank. A timed drag draws no `data-drop-target` outline, because the ghost already shows the span. The outline appears only on a drag that has no ghost. Events with a `recurrenceRule` cannot be dragged or resized unless the grid sets `recurringEventsMovable`; events with `movable: false` never can, and they still open. A timed, single-day event that can move also has a handle on its bottom edge. Its grab bar shows on hover with a fine pointer, on touch, and while the handle is pressed; focus never shows it, and it stays hidden during a move drag. Dragging it emits `onResizeRequest({ event, to, confirm, cancel })` with the new end snapped to the nearest quarter hour, and `to` is the cell ending there. Alt+ArrowDown or Alt+ArrowUp on the card steps the end one slot. The card shows the new size until the host calls `confirm` or `cancel`. While a range is painted, a preview block covers its rows in each day column, styled like an uncoloured event card with a clock icon and the viewer-time range, such as `15:00 – 16:30`.
- `read-only` preserves the rendered surface and event viewing, but emits none of the create, paint or move callbacks. Unavailable and `access="busy"` events are never activated.

`now?: UtcInstant` optionally controls the reference instant for the current-time marker and past-event state; when omitted, the component follows the host wall clock.

`interactionMode` and `selectedEventId` support controlled values with change callbacks. `defaultInteractionMode` and `defaultSelectedEventId` provide uncontrolled initial values.

## Density

`rowHeight?: number` sets the height of one row in pixels; the default is `43`. It must be a positive finite number, or render throws a `RangeError`. `maxEventsPerSlot?: number` caps the cards that start in one row of a day column. The earliest stay visible, and the rest hide behind a `+N` lane tile in the lane after the visible cards. Its text, `+ N events` by default, comes from `renderOverflow(hiddenCount, cell)`. A click on the tile calls `onOverflowSelect(cell, anchor)`. Without `onOverflowSelect` the tile is plain text, not a button. Without a cap every card is drawn.

## Slots and states

`renderEventMetadata` replaces the metadata rows of the default card and keeps its button and frame; use it for one row. `getEventFrameProps` returns a `className` and a `data-tone` for the event's card frame, so host CSS can mark a conflict or busy state. It cannot set inline styles, so the focus outline stays in the kit's CSS. `renderEvent`, `renderConflict` and `renderDetail` replace host-specific event, conflict and detail content. Event contexts retain opaque `metadata`; conflict contexts retain the event and host-supplied dimension label. The default event uses `EventCard`; a custom event renders inside a button, and conflicts use `ConflictIndicator`. Loading, error, and empty-state presentation remains outside the kit: the supplied events render directly into the ordinary grid, including when the collection is empty. The custom detail slot receives `close`, which dismisses the composed detail surface without performing a backend operation.

## Accessibility and styling

The component composes `CalendarGrid` with semantic grid dimensions, one roving tab stop, keyboard movement and RTL-aware horizontal navigation. Its scroll surface is a plain scroll container owned by the component. Event cards remain keyboard-actionable, expose `data-event-id`, selected/unavailable states and focus rings. Import `@gears-frontx/calendar-kit/theme.css` once in the host; component styles use the documented `--cal-*` aliases only. Every root accepts `className`.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.week -->

| Translation ID | English | Values |
| --- | --- | --- |
| `calendar.week.allDay` | All-day events |  |
| `calendar.week.currentTime` | Current time |  |
| `calendar.week.focus` | Week view |  |
| `calendar.week.nonWorkingHour` | non-working hour |  |
| `calendar.week.overflow` | + {{count}} events | `count` |
| `calendar.week.range` | Week of |  |
| `calendar.week.timeZone` | Time zone |  |
| `calendar.week.unavailableContinue` | Continue |  |
| `calendar.week.unavailableMessage` | The time you painted overlaps an unavailable period. Choose a time that is free. |  |
| `calendar.week.unavailableTitle` | Overlaps an unavailable period |  |
| `calendar.week.workingHour` | working hour |  |

<!-- /generated -->

## Related

- [DayGrid](../day-grid/day-grid.md)
- [EventCard](../event-card/event-card.md)
- [EventDetailPanel](../event-detail-panel/event-detail-panel.md)
- [CreateEventPanel](../create-event/create-event.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
