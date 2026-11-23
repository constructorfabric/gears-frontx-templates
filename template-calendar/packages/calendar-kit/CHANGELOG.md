# Changelog

All notable changes to `@gears-frontx/calendar-kit` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and publishes pre-release versions on the `alpha` channel.

## [Unreleased]

### Added

- An event card with an `error` conflict paints a red surface, a leading bar, and busy stripes, shows a circle-xmark icon in the title row, and sets `data-conflict="true"`. The conflict look holds while the card is selected.
- `DayGrid` accepts `maxEventsPerSlot` and `onOverflowSelect`, as `WeekGrid` does. Hidden cards show as a `+ N events` lane tile after the visible ones.
- `layoutTimedEvents` takes a `trailing` flag that sorts an item after the events that start at the same instant.
- `WeekGrid` and `DayGrid` take `recurringEventsMovable`. When set, recurring events can be dragged, touch-dragged and resized in `paint-and-move` mode, and `onMoveRequest` and `onResizeRequest` fire as they do for one-off events. The request carries the event with its `recurrenceRule`, so the host can choose occurrence or series. Default `false` keeps recurring events in place.

### Changed

- Paint-and-move delivers the range the preview shows when a paint shrinks before React flushes the previous render.
- Day and week grid lines and their outer border use `--cal-color-divider` (host `--divider`) instead of `--cal-color-grid-line`.
- `WeekGrid` draws the `+N` overflow as a lane tile beside the visible cards instead of a corner chip. Its message `calendar.week.hidden` is replaced by `calendar.week.overflow`.
- `--cal-color-error` maps to the host `--danger` (default `#d40834`, `#ff7065` in dark scopes) instead of `--destructive`, so error and conflict states share one red. Hosts that set only `--destructive` see the kit default.
## Unreleased

### Changed

- `SearchResults` default rows are cards with start and end times, the event colour bar, duration, a Now label for in-progress rows, organizer, guest count, and attendee avatars with a "+N" overflow. The default row no longer shows location.
- `SearchResultContext` gains `isNow`, computed from the `now` prop, for `renderResult`.
- Day and week grids now draw the paint preview like a plain event card: neutral surface, text colour, the card's time row and a clock icon. Its range uses the en dash of the card's time row, such as `15:00 – 16:30`.
- `RecurrenceScopeDialog` asks whether an edit, move or delete applies to this event, this and following events, or all events. Its strings sit under `calendar.recurrenceScope.*`.

## [0.1.0-alpha.1] - 2026-11-12

### Changed

- **Breaking:** `CalendarConflictDimension` is now `string`, so any dimension name type-checks. `dimension` keeps its name.
- **Breaking:** `CalendarEvent` no longer has `roomId`, `classroom`, `instructor` or `course`. Put such data in `metadata` and render it with `renderMetadata` or `renderBody`. The event detail panel no longer draws Classroom, Instructor and Course rows, and the `calendar.detail.classroom`, `calendar.detail.instructor` and `calendar.detail.course` message ids are gone.
- **Breaking:** `MonthGridTermWeekNumbering { termStart }` is `MonthGridRelativeWeekNumbering { startDate }`, and the core helper `termWeekNumber(weekStart, termStart)` is `relativeWeekNumber(weekStart, startDate)`. The behaviour is unchanged: the week holding `startDate` is week 1.
- **Breaking:** the create-event label id `calendar.create_event.calendarSchedule` is now `calendar.create_event.calendarField`, with English text `Calendar:`.
- **Breaking:** the `exports` map lists only the documented entries and the CSS and `package.json` files. The `./*` wildcard is removed, and `src`, `chunks`, `__test-utils__`, `core/*`, `react/*`, `ui/*`, `docs/*`, `i18n/*` and `styles/*` are not importable.
- Documentation and examples use neutral vocabulary, for example `eventType` "Meeting" and "Workshop" and conflict dimensions `resource` and `person`.

## [0.1.0-alpha.0] - 2026-09-24

### Added

- First public release: React 19 calendar UI for week, day, month and agenda screens, built over `@gears-frontx/ui-kit` primitives. The kit renders host data and reports user intent through typed callbacks; data, access rules, conflicts, persistence and translations stay with the host.
- Root entry `@gears-frontx/calendar-kit`, re-exporting the components, controller hooks, parsers and types below, except the two annotated with the entry that carries them.
- Subpath entries, each with its own declarations: `@gears-frontx/calendar-kit/core`, `@gears-frontx/calendar-kit/react`, `@gears-frontx/calendar-kit/i18n`, `@gears-frontx/calendar-kit/grid`, `@gears-frontx/calendar-kit/week-grid`, `@gears-frontx/calendar-kit/day-grid`, `@gears-frontx/calendar-kit/month-grid`, `@gears-frontx/calendar-kit/agenda-view`, `@gears-frontx/calendar-kit/calendar-toolbar`, `@gears-frontx/calendar-kit/event-card`, `@gears-frontx/calendar-kit/event-detail-panel`, `@gears-frontx/calendar-kit/create-event`, `@gears-frontx/calendar-kit/conflict-indicator`, `@gears-frontx/calendar-kit/availability-grid`, `@gears-frontx/calendar-kit/calendar-side-panel`, `@gears-frontx/calendar-kit/month-navigator`, `@gears-frontx/calendar-kit/search-results`, `@gears-frontx/calendar-kit/time-zone-list`, `@gears-frontx/calendar-kit/world-clocks` and `@gears-frontx/calendar-kit/calendar-list`.
- Stylesheets: `@gears-frontx/calendar-kit/theme.css` maps the `--cal-*` tokens from host seams with kit fallbacks, `@gears-frontx/calendar-kit/reset.css` is the opt-in scoped reset, and `@gears-frontx/calendar-kit/themes/example.css` is an optional example preset.
- Components: `WeekGrid`, `DayGrid`, `MonthGrid`, `AgendaView`, `CalendarGrid`, `CalendarToolbar`, `EventCard`, `EventDetailPanel`, `CreateEventPopover`, `ConflictIndicator`, `AvailabilityGrid`, `CalendarSidePanel`, `MonthNavigator`, `SearchResults`, `TimeZoneList`, `WorldClocks` and `CalendarList`.
- Localization: `CalendarLocalizationProvider` owns `locale`, `direction`, `t`, `messages` and `onMissingTranslation`, and `CalendarProvider` owns the viewer `timeZone`; `useCalendarLocalization` and `useCalendarContext` read them. `ENGLISH_TRANSLATIONS` carries the built-in English catalogue, and `englishTranslate` (on the `i18n` entry) is that catalogue as a standalone translator; the `CalendarTranslate`, `CalendarMessages` and `CalendarTranslations` types describe host catalogues.
- Model and helpers: `CalendarEvent` and the branded parsers `calendarDate`, `parseLocalTime`, `utcInstant` and `parseIanaTimeZone`; time windows `CalendarTimeWindow`, `CalendarSlotMinutes`, `FULL_DAY_TIME_WINDOW`, `DEFAULT_WORKING_HOURS` and `DEFAULT_SLOT_MINUTES` with `assertTimeWindow`, `buildSlotStarts`, `buildTimeWindowRange`, `countWindowSlots` and `isWithinTimeWindow`; date-range selection `CalendarDateRange`, `orderDateRange`, `isDateInRange`, plus `useDateRangeSelection` (on the `react` entry); controller hooks `useWeekGridController`, `useDayGridController`, `useMonthGridController`, `useAgendaViewController`, `useCalendarToolbarController`, `useCalendarSidePanelController`, `useMonthNavigatorController`, `useSearchResultsController`, `useAvailabilityGridController`, `useWorldClocksController`, `useEventDetailPanelController` and `useCreateEventController`.
- TypeScript declarations, source maps and the documentation pages under `dist/docs/` ship with the package.
