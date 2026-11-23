# SearchResults

`SearchResults` is a neutral, local search surface for supplied calendar events. It never fetches data or performs navigation: the host supplies events and receives the selected event and viewer date through `onReveal`.

```tsx
import { SearchResults } from "@gears-frontx/calendar-kit/search-results";

<SearchResults
  events={events}
  query={query}
  now={now}
  locale="en-US"
  timeZone={timeZone}
  direction="ltr"
  t={t}
  onReveal={(eventId, date) => revealEvent(eventId, date)}
  onDismiss={() => setQuery("")}
/>;
```

## Props

<!-- generated:props SearchResultsProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `events` | `readonly CalendarEvent[]` | yes | Events to search. |
| `now` | `UtcInstant` | yes | Reference instant for the Today group and the Now label on in-progress rows. |
| `onDismiss` | `() => void` | yes | Escape was pressed on a result. |
| `onReveal` | `(eventId: string, date: CalendarDate) => void` | yes | A result was activated. Receives the event id and the viewer day of the row. |
| `calendarIds` | `readonly string[]` |  | Search only events on these calendars. |
| `className` | `string` |  | Class added to the component root. |
| `defaultQuery` | `string` |  | Initial query when uncontrolled. |
| `onQueryChange` | `(query: string) => void` |  | Called when the query changes. |
| `query` | `string` |  | Controlled query. |
| `range` | `CalendarDateRange` |  | Keep only matches on days inside this range. |
| `renderGroupHeader` | `(group: string, count: number) => ReactNode` |  | Replaces a day heading. |
| `renderResult` | `(event: CalendarEvent, context: SearchResultContext) => ReactNode` |  | Replaces a row's content. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Query and announcements

Queries are trimmed, lowercased, and diacritic-folded before matching the event title, organizer, location, description, event type, and attendee names and emails. Pass `calendarIds` to search only events on those calendars, and `range` (inclusive days) to keep only matches inside it; the host owns the controls that set them. Results require two characters and settle after 200 ms; the previous result set remains visible while a new query is pending. The result list is always rendered, and contains no rows for a too-short query or when no event matches. A query that matches nothing shows "No events match your search" under the field, as a plain paragraph. The result count remains a separate polite, atomic status announcement. Fetching and failure presentation remain host concerns.

Timed events are grouped by viewer day, including midnight-spanning segments; all-day events appear on each date in their exclusive-end range.

The result list uses one roving tab stop. Arrow Up/Down, Home, and End move focus; Enter or Space calls `onReveal`, and Escape calls `onDismiss`. Result rows are native buttons laid out as list rows and expose only the public `data-event-id` hook; all other styling state is expressed through CSS Modules.

## Result cards

Timed events are grouped by viewer day, named relative to `now` (Today, Tomorrow), then by date. Each default row is a card: start and end time, the event colour bar, title, duration, a Now label when `now` falls inside the row, organizer, guest count, and up to six attendee avatars followed by a "+N" overflow. The duration is the length of the row's day segment. Location is not on the default card; it still matches searches. All-day rows show "All day" in place of the times. `renderResult` replaces the card and receives `isNow` in its context.

## Related

- [CalendarSidePanel](../calendar-side-panel/calendar-side-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
