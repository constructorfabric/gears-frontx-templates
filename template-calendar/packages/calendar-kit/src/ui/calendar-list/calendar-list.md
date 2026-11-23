# CalendarList

`CalendarList` renders a controlled calendar visibility legend. Every calendar is rendered independently of loaded events, including an empty calendar, and its checkbox is checked when its id is absent from `hiddenCalendarIds`. An empty collection keeps the ordinary section without an empty-state shell or status region.

```tsx
<CalendarList
  calendars={calendars}
  hiddenCalendarIds={hiddenCalendarIds}
  onHiddenCalendarIdsChange={setHiddenCalendarIds}
  t={t}
  direction="ltr"
/>
```

Use `renderCalendar` to replace a row's visible content, `renderCreateCalendar` to supply a consumer-owned creation action, or `onCreateCalendar` for the default labelled button. The kit never creates or persists calendars.

Set `parentId` on a `CalendarRef` to nest it under another calendar in the list, and `group` to list it under a heading such as "My calendars" (the host localizes the text). A parent's checkbox covers itself and everything under it: it shows a dash when only some are visible, and one click hides all of them, or shows all of them unless they were all visible already. A `parentId` that is not in the list, or that points back into its own chain, leaves the calendar at the top level.

Passing any option callback adds a three-dot button to each row, shown on hover and focus. Its menu offers:

- Color: opens a picker with seven swatches and Cancel/Apply. Arrow keys move the selected swatch. Apply calls `onCalendarColorChange(id, colorFamily)` only when the color changed; Cancel returns to the menu without a call.
- Show only this calendar: calls `onShowOnlyCalendar(id)`. While the calendar is `soloCalendarId`, the menu offers Show previously visible instead, which calls `onShowPreviouslyVisible()`.
- Make default: calls `onMakeDefaultCalendar(id)`. Disabled when `isDefault` is true or `canWrite` is not true.
- Delete: calls `onDeleteCalendar(id)`. Disabled unless `canDelete` is true. The host confirms before it deletes.

Each item appears only when its callback is passed. The host owns the state behind Show only: it passes `hiddenCalendarIds` and `soloCalendarId`, and the kit does not remember the previous visibility.

Rows pair a label with a checkbox. The seven colour families (blue, lavender, violet, purple, orange, brown, turquoise) are carried by local colour classes; an unknown family falls back to the default action colour without inventing a token. A hidden calendar's name and unticked box are muted. Static row styling lives in this module's CSS rather than inline styles.

## Props

<!-- generated:props CalendarListProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `calendars` | `readonly CalendarRef[]` | yes | Calendars to list. |
| `hiddenCalendarIds` | `readonly string[]` | yes | Ids of calendars whose checkbox is off. |
| `onHiddenCalendarIdsChange` | `(hiddenCalendarIds: readonly string[]) => void` | yes | Called with the new hidden ids after a toggle. |
| `className` | `string` |  | Class added to the component root. |
| `onCalendarColorChange` | `(calendarId: string, colorFamily: CalendarColorFamily) => void` |  | Saves a new colour for the calendar. |
| `onCreateCalendar` | `() => void` |  | Shows a default create button that calls this. |
| `onDeleteCalendar` | `(calendarId: string) => void` |  | Deletes the calendar. The host confirms before it deletes. |
| `onMakeDefaultCalendar` | `(calendarId: string) => void` |  | Marks the calendar as the default for new events. |
| `onShowOnlyCalendar` | `(calendarId: string) => void` |  | Hides every other calendar. |
| `onShowPreviouslyVisible` | `() => void` |  | Restores the visibility from before the calendar was shown alone. |
| `renderCalendar` | `(calendar: CalendarRef, hidden: boolean) => ReactNode` |  | Replaces a row's content. |
| `renderCreateCalendar` | `() => ReactNode` |  | Replaces the create button. |
| `soloCalendarId` | `string` |  | Id of the calendar shown alone. Its menu offers Show previously visible. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.list -->

| Translation ID                        | English                 | Values |
| ------------------------------------- | ----------------------- | ------ |
| `calendar.list.add`                   | Add                     |        |
| `calendar.list.apply`                 | Apply                   |        |
| `calendar.list.cancel`                | Cancel                  |        |
| `calendar.list.color`                 | Color                   |        |
| `calendar.list.colorBlue`             | Blue                    |        |
| `calendar.list.colorBrown`            | Brown                   |        |
| `calendar.list.colorLavender`         | Lavender                |        |
| `calendar.list.colorOrange`           | Orange                  |        |
| `calendar.list.colorPicker`           | Calendar color          |        |
| `calendar.list.colorPurple`           | Purple                  |        |
| `calendar.list.colorTurquoise`        | Turquoise               |        |
| `calendar.list.colorViolet`           | Violet                  |        |
| `calendar.list.delete`                | Delete                  |        |
| `calendar.list.makeDefault`           | Make default            |        |
| `calendar.list.moreOptions`           | More options            |        |
| `calendar.list.options`               | Calendar options        |        |
| `calendar.list.optionsFor`            | Options for {{name}}    | `name` |
| `calendar.list.showOnly`              | Show only this calendar |        |
| `calendar.list.showPreviouslyVisible` | Show previously visible |        |

<!-- /generated -->

## Related

- [CalendarSidePanel](../calendar-side-panel/calendar-side-panel.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
