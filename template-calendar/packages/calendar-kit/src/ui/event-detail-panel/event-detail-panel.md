# EventDetailPanel

Event detail as an inline, labelled region (`<section>`). The host places it, for example in a side sheet; the panel opens no popover or dialog. The header is one row: the title, clamped to three lines, then icon buttons with tooltips (edit, delete, a divider, close); the header stays put while the body scrolls inside the panel. The body is rows in groups split by a rule. Each row has a visible label above its content: time with recurrence (in words, as the create form says it, for daily, weekly, monthly and yearly rules; any other rule goes to `calendar.detail.recurrence` as raw text), time zones and conferencing (Join and Copy link); location and conflicts; organizer with email and participants as one line (the invited count, then the responses given) above up to five avatars, whose +N swaps them for the full guest list grouped by response; description. Each label is also a heading for screen readers. Reminders show a bell before the title, and an early-reminder notice when `notify` is set. Workshop rows (resource, person, item) appear only when set. Activity offers Go to page and Copy link for an `http(s)` `url`; other URLs are not linked or copied. Edit and delete are left to the host through `onEdit`/`onDelete` or `renderActions`.

Import it from its own entry; the stylesheet arrives with the component:

```ts
import {
  EventDetailPanel,
  type EventDetailPanelProps,
} from "@gears-frontx/calendar-kit/event-detail-panel";
```

## Props

<!-- generated:props EventDetailPanelProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `onClose` | `() => void` | yes | Called by the close button and Escape. |
| `className` | `string` |  | Class added to the component root. |
| `comparisonTimeZone` | `IanaTimeZone` |  | Adds a second line with the event time in this zone. |
| `container` | `Element \| DocumentFragment` |  | Element that holds the focused opener, for example a node inside a shadow root. |
| `defaultOpen` | `boolean` |  | Initial open state when uncontrolled. |
| `event` | `CalendarEvent` |  | The event to show. |
| `maxVisibleParticipants` | `number` |  | Avatars shown before the `+N` control. Default `5`. |
| `onDelete` | `(event: CalendarEvent) => void` |  | Shows the delete button. Hidden when `readOnly` or the event is busy. |
| `onEdit` | `(event: CalendarEvent) => void` |  | Shows the edit button. Hidden when `readOnly` or the event is busy. |
| `onOpenChange` | `(open: boolean) => void` |  | Called when the panel opens or closes. |
| `open` | `boolean` |  | Controlled open state. |
| `readOnly` | `boolean` |  | Hides edit and delete. |
| `renderActions` | `(event: CalendarEvent) => ReactNode` |  | Replaces the edit and delete buttons. |
| `renderBody` | `(event: CalendarEvent) => ReactNode` |  | Replaces the whole default body. |
| `renderFooter` | `(event: CalendarEvent) => ReactNode` |  | Content below the body, for example RSVP controls. |
| `renderHeader` | `(event: CalendarEvent \| null) => ReactNode` |  | Content below the header row. |
| `renderMetadata` | `(event: CalendarEvent) => ReactNode` |  | Host rows appended to the body. |
| `selectedEventId` | `string` |  | Id of the selected event, for host bookkeeping. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Composition

The region is labelled by its title, which takes focus when the panel opens or the event changes. Escape closes it, also while a header tooltip is open; a press outside does not close it. Participant rows show a decorative avatar beside the attendee's name and email. The default copy action is a low-emphasis text button that shows Copied, with a check, for a moment after a copy; every icon-only header button carries an accessible label and a tooltip.

## Host frame and parts

`EventDetailContent` is the same inline region as `EventDetailPanel`, under the name a host uses when it draws its own frame. The kit draws no popover, dialog or sheet, so the host places the content in its own container and owns open state, Escape and focus return. It takes the same props as `EventDetailPanel`.

To add host rows in the kit's look, use the exported parts inside `renderBody` or `renderMetadata`:

- `EventDetailSection` groups rows. An empty section is hidden, and a rule is drawn only between sections that have content. Takes `className` and `children`.
- `EventDetailRow` is one labelled row: `label` renders as a heading above `children`. Takes `label`, `className` and `children`.
- `EventDetailDivider` draws a decorative rule between rows or sections the host adds.

Do not copy the kit's CSS classes into host CSS to imitate these rows. Use the parts.

## Safety and announcements

- Only `http(s)` join URLs become a link or a copy target; anything else fails closed (no link, no copy button, and no clipboard access).
- Copy success/failure is announced through a visually hidden `role="status"` region using the resolved translator's `calendar.detail.copy.copied` and `calendar.detail.copy.failed` messages; the status returns to idle after `COPY_STATUS_RESET_MS`.
- Busy-access events hide details, participants, RSVP, join/copy, and terminal actions: a compact card with the title, the range and a restricted note, and no edit or delete.
- The panel renders the supplied event directly. It does not create loading, error, or empty-state shells; fetching and failure presentation remain host concerns.
- On close, focus returns to the element that was active when the panel opened, including an opener inside the supplied shadow root. Pass `container` when the opener sits inside a shadow root.

## Controller

`useEventDetailPanelController` (also exported from this entry) owns open state, copy status, participant capping, restriction, focus-origin capture, and terminal-action availability. Frozen result names: `isOpen`, `close`, `canCopyJoinLink`, `copyLink`, `copyStatus`, `visibleParticipants`, `participantOverflowCount`, `isRestricted`, `canEdit`, `canDelete`, `handleEdit`, `handleDelete`, plus the read-only `getInternals()` accessor. `COPY_STATUS_RESET_MS` (2000) is exported for consumers and tests.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.detail -->

| Translation ID | English | Values |
| --- | --- | --- |
| `calendar.detail.activity` | Activity |  |
| `calendar.detail.close` | Close |  |
| `calendar.detail.conferencing` | Conferencing |  |
| `calendar.detail.conflicts` | Conflicts |  |
| `calendar.detail.copy.copied` | Copied |  |
| `calendar.detail.copy.failed` | Copy failed |  |
| `calendar.detail.copy.link` | Copy link |  |
| `calendar.detail.dateTime` | Date & time |  |
| `calendar.detail.delete` | Delete |  |
| `calendar.detail.description` | Description |  |
| `calendar.detail.earlyReminder` | Early reminder: {{lead}} | `lead` |
| `calendar.detail.edit` | Edit |  |
| `calendar.detail.goToPage` | Go to page |  |
| `calendar.detail.group.awaiting` | Awaiting · {{count}} | `count` |
| `calendar.detail.group.maybe` | Maybe · {{count}} | `count` |
| `calendar.detail.group.no` | Not going · {{count}} | `count` |
| `calendar.detail.group.unknown` | Invited · {{count}} | `count` |
| `calendar.detail.group.yes` | Going · {{count}} | `count` |
| `calendar.detail.invited` | {{count}} invited | `count` |
| `calendar.detail.join` | Join |  |
| `calendar.detail.location` | Location |  |
| `calendar.detail.organizer` | Organizer |  |
| `calendar.detail.participants` | Participants |  |
| `calendar.detail.participants.more` | more |  |
| `calendar.detail.recurrence` | Repeats {{rule}} | `rule` |
| `calendar.detail.reminderLead.minutes_one` | {{count}} minute before | `count` |
| `calendar.detail.reminderLead.minutes_other` | {{count}} minutes before | `count` |
| `calendar.detail.reminderLead.now` | At time of event |  |
| `calendar.detail.repeatCount_one` | {{frequency}}, {{count}} time | `frequency`, `count` |
| `calendar.detail.repeatCount_other` | {{frequency}}, {{count}} times | `frequency`, `count` |
| `calendar.detail.restricted` | Restricted |  |
| `calendar.detail.rsvp.awaiting` | {{count}} awaiting | `count` |
| `calendar.detail.rsvp.maybe` | {{count}} maybe | `count` |
| `calendar.detail.rsvp.no` | {{count}} no | `count` |
| `calendar.detail.rsvp.yes` | {{count}} yes | `count` |
| `calendar.detail.timeZone` | Time zone |  |
| `calendar.detail.title` | Event details |  |

<!-- /generated -->

## Related

- [EventCard](../event-card/event-card.md)
- [WeekGrid](../week-grid/week-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
