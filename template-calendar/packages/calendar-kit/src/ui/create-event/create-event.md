# CreateEventPanel

`CreateEventPanel` is a host-neutral create-event form. It accepts a neutral `CreateEventDraft`, injected calendar/resource options, a translation callback, an optional `now?: UtcInstant` reference instant, and an `onSubmit` callback; it does not call application APIs or create adapters.

The form renders inline in the host container and is shadow-root safe; the host places it. Use `defaultDraft`/`defaultOpen` for uncontrolled usage, or pair the controlled props with their change callbacks.

## Props

<!-- generated:props CreateEventPanelProps -->

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `calendars` | `readonly CalendarRef[]` | yes | Calendars offered in the calendar field. |
| `conferencingProviders` | `readonly CalendarResourceOption[]` | yes | Conferencing providers offered in the conferencing select. |
| `locations` | `readonly CalendarResourceOption[]` | yes | Locations offered in the location combobox. |
| `onCancel` | `() => void` | yes | Called when the form closes without saving: a clean cancel, or a confirmed discard. |
| `onSubmit` | `(draft: CreateEventDraft) => Promise<CreateEventResult> \| undefined` | yes | Called with a valid draft; a returned `error` keeps the form open. |
| `people` | `readonly CalendarResourceOption[]` | yes | People offered in the people combobox. |
| `className` | `string` |  | Class added to the component root. |
| `defaultDraft` | `CreateEventDraft` |  | Initial draft when uncontrolled. Also the baseline for the unsaved-changes check. |
| `defaultOpen` | `boolean` |  | Initial open state when uncontrolled. |
| `draft` | `CreateEventDraft` |  | Controlled draft. |
| `eventTypeIds` | `readonly string[]` |  | Ids of the event types the form offers. A picked id outside this list fails validation. |
| `eventTypeRequired` | `boolean` |  | Blocks submit until an event type is picked. Ignored when `eventTypeIds` is empty. |
| `eventTypes` | `readonly CreateEventTypeOption[]` |  | Event types offered in the event-type field. The field is not rendered when empty or omitted. |
| `kind` | `CreateEventKind` |  | Kind the form edits. `reminder` shows the reminder fields and hides the event-only ones. |
| `locationHierarchy` | `readonly CalendarLocationNode[]` |  | Nested locations, one select per level in place of the flat location combobox. |
| `now` | `UtcInstant` |  | Reference instant for the time-zone offset label. |
| `onDraftChange` | `(draft: CreateEventDraft) => void` |  | Called on every field edit. |
| `onKindChange` | `(kind: CreateEventKind) => void` |  | Shows the Event/Reminder switch in the header and reports the kind the user picks. |
| `onOpenChange` | `(open: boolean) => void` |  | Called on open and close, including after submit and a confirmed discard. |
| `open` | `boolean` |  | Controlled open state. |
| `ref` | `((instance: CreateEventPanelHandle \| null) => void \| (() => VoidOrUndefinedOnly)) \| RefOb…` |  | Lets the host close the form through its own unsaved-changes prompt. |
| `renderError` | `(error: CreateEventSubmitError) => ReactNode` |  | Replaces how a submit error is shown. |
| `renderFields` | `(draft: CreateEventDraft) => ReactNode` |  | Extra host fields rendered after the kit's fields. Receives the current draft. |
| `renderFooter` | `() => ReactNode` |  | Content added above the Cancel/Save row. |
| `renderHeader` | `() => ReactNode` |  | Content added below the header row. |

Also accepts the shared props `direction`, `locale`, `messages`, `t`, `timeZone`, `translations`; see [Internationalization](../../docs/i18n.md#per-component-overrides).
<!-- /generated -->

## Behaviour

- The header shows an event-type title (`Event` by default), a slot for host header content, and a close icon action with its accessible label. The body scrolls inside its region above the Cancel/Save footer.
- Title, calendar, time range, all-day switch, dates with a day count once they span a day, recurrence, timezone, people, conferencing, location, and description fields update one draft.
- With `onKindChange`, the header shows an Event/Reminder switch and `kind` selects the form. Reminder shows title, URL, time range, dates, all-day, Notify me, repeat, and the time zone row; it hides calendar, event type, people, conferencing, location, and description, and switching to it clears those draft fields. Switching to Event clears `url`. The URL must be an `http(s)` link without credentials, at most 2048 characters, and shows `Enter a valid value` while invalid. Notify stores `notify: { leadMinutes }` (0, 5, 10, 15, 30 or 60, default 10) or `null` when off. Turning it on asks for browser permission only when the permission is `default`; a denied, missing or dismissed prompt keeps it off with an inline message. The form only stores the choice; the host delivers the notification.
- Dates and times use the large icon-left field treatment; the calendar field shows its calendar colour as a dot in the selected value and each option, and people tags use stroke tags with dismiss and clear-all actions.
- Timed events leave the end date empty when it is the same as the start date; the day-span indicator is shown only for a positive span.
- Date rows are masked date inputs: the date mask is typed segment by segment in the order the display reads (day, then month, for `Wed, 11 Nov`) and commits as soon as it parses, the calendar button ahead of the value (or `Alt+ArrowDown`) opens a picker whose selection writes the row directly, and the optional end date clears from the trailing clear button. A typed end date before the start shows `End must be after start` under the end date as soon as it commits, and Save stays disabled until it is fixed.
- The location control starts as a secondary `Add a location` action and opens the injected location combobox when requested. With an empty `locations` list it is a plain free-text field (no chevron, no "no results" popup). With `locationHierarchy`, one select per level replaces it: the next level appears after a choice, and the leaf id is written to `draft.location`.
- The conferencing field renders only when `conferencingProviders` is non-empty. Without providers it is hidden and a draft's existing `conferencingProviderId` is left untouched.
- The people and location comboboxes use the shared 36px form-field skin; selected people use 24px removable chips inside the same form-layer frame.
- Each selected person chip has an `Optional` toggle (`aria-pressed`, keyboard operable). Toggled ids go to `draft.optionalAttendeeIds`; removing a person also removes its id, and clearing all people clears both lists. Everyone is required until marked. Groups (`kind: 'group'`) show a group icon and are selected like people; the host expands them into attendees itself.
- Timed and all-day ranges are validated by the React-free core helper before `onSubmit` runs. The Save action is disabled while the draft is invalid or submitting.
- Repeat offers Doesn’t repeat, Daily, Weekly, Biweekly, Monthly, Yearly and Custom. The Custom option's label never changes, whatever rule it holds.
- Custom expands an editor inline under the Repeat field; the interval is a number field from 1 to 30. Every change is written to the draft immediately as an RFC 5545 rule body such as `FREQ=WEEKLY;BYDAY=MO,WE`. While it is open, the other fields are dimmed and inert, Save is disabled, and Repeat stays live. Save keeps the rule, Cancel restores the preset and rule from when it opened, and Escape collapses it like Save. Choosing another preset closes it; choosing Custom again reopens the saved rule. Weekday choices are toggle buttons in display order; `Ends: Never` omits an end and `Ends: On` appends `UNTIL=YYYYMMDD`.
- A one-line summary under the Repeat field describes the current rule for every choice, for example "Repeats every 2 weeks on Tuesday and Thursday until Wed, Sep 30, 2026". "Does not repeat" shows no summary.
- A pending submit disables duplicate attempts. A host error is rendered without closing the form.
- A clean cancel closes immediately. A dirty cancel, or an outside press in a dirty form, opens an alert dialog with keep-editing and discard actions; that press does not reach its target. An outside press in a clean form does nothing. Confirmed discard closes the form.
- A dialog or menu the host portals outside the form is a press inside the form only when it is registered with `registerNestedLayer(layer, anchor)`. `anchor` is an element inside the form; the call returns a function that removes the registration. Presses in a registered layer neither close the form nor open the discard dialog.
- `ref` takes a `CreateEventPanelHandle`; its `requestCancel()` runs the same cancel path as the close control and resolves `true` once the form closed, or `false` when the user kept editing or a save is running.
- `renderHeader`, `renderFields`, `renderFooter`, `renderError`, and shell render props provide host composition without app imports.
- `renderFields(draft)` receives the current draft, so the host can render event-type fields from `draft.eventTypeId`. The kit does not know which types exist:

```tsx
const fieldsByEventType: Record<string, () => ReactNode> = {
  interview: () => <InterviewFields />,
  review: () => <ReviewFields />,
};

<CreateEventPanel
  {...props}
  renderFields={(draft) => fieldsByEventType[draft.eventTypeId ?? '']?.()}
/>;
```

Mark attendees optional and show a group in the people list by passing options and reading the draft back:

```tsx
<CreateEventPanel
  {...props}
  people={[
    { id: 'ada', label: 'Ada Lovelace' },
    { id: 'design', label: 'Design team', kind: 'group' },
  ]}
  defaultDraft={{ ...draft, attendeeIds: ['ada', 'design'], optionalAttendeeIds: ['ada'] }}
  onSubmit={(submitted) => {
    // submitted.optionalAttendeeIds is ['ada'] when Ada is marked optional.
    return save(submitted);
  }}
/>
```

Offer nested locations as one select per level. The leaf id is written to the draft, so `Room 204` submits as `room-204`:

```tsx
<CreateEventPanel
  {...props}
  locationHierarchy={[
    {
      id: 'north-campus',
      label: 'North campus',
      children: [
        {
          id: 'building-a',
          label: 'Building A',
          children: [{ id: 'room-204', label: 'Room 204' }],
        },
      ],
    },
    { id: 'virtual', label: 'Virtual' },
  ]}
  onSubmit={(submitted) => save(submitted)} // submitted.location is 'room-204' for Room 204
/>
```

Without `locationHierarchy` the flat location combobox stays. With it, the `locations` prop is not shown.

All labels come from `t`; `locale`, `timeZone`, `direction`, and `now` are presentation inputs. When `now` is omitted, the time-zone label follows the wall clock. The title is plain text.

The event type is host data. `eventTypes` takes `{ id, label, colorFamily? }` items; the picked `id` is written to `draft.eventTypeId`. The field renders below the calendar field only when `eventTypes` has items, and only for the event kind. A picked id that is not in `eventTypes` fails validation. `eventTypeRequired` blocks Save and submit until an event type is picked, and shows `Event type is required`. It has no effect when `eventTypes` is empty or omitted. The controller takes the same ids as `eventTypeIds`.

## Messages

Translate these ids, or override them with `translations`; see [Internationalization](../../docs/i18n.md).

<!-- generated:messages calendar.create_event -->

| Translation ID | English | Values |
| --- | --- | --- |
| `calendar.create_event.all_day` | All day |  |
| `calendar.create_event.back` | Back |  |
| `calendar.create_event.calendarField` | Calendar: |  |
| `calendar.create_event.cancel` | Cancel |  |
| `calendar.create_event.close` | Close |  |
| `calendar.create_event.create_dialog` | Create event |  |
| `calendar.create_event.dayCount_one` | {{count}} day | `count` |
| `calendar.create_event.dayCount_other` | {{count}} days | `count` |
| `calendar.create_event.discard.confirm` | Discard |  |
| `calendar.create_event.discard.keep` | Keep |  |
| `calendar.create_event.discard.message` | Discard unsaved changes? |  |
| `calendar.create_event.discard.title` | Changed |  |
| `calendar.create_event.error.endBeforeStart` | End must be after start |  |
| `calendar.create_event.error.event_type_required` | Event type is required |  |
| `calendar.create_event.error.invalid` | Enter a valid value |  |
| `calendar.create_event.error.required` | Title is required |  |
| `calendar.create_event.field.calendar` | Calendar |  |
| `calendar.create_event.field.conferencing` | Conferencing |  |
| `calendar.create_event.field.description` | Description |  |
| `calendar.create_event.field.end_date` | End date |  |
| `calendar.create_event.field.end_time` | End time |  |
| `calendar.create_event.field.event_type` | Event type |  |
| `calendar.create_event.field.location` | Location |  |
| `calendar.create_event.field.location_level` | Location level {{level}} | `level` |
| `calendar.create_event.field.notify` | Notify me |  |
| `calendar.create_event.field.notify_lead` | Notify before |  |
| `calendar.create_event.field.people` | People |  |
| `calendar.create_event.field.repeat` | Repeat |  |
| `calendar.create_event.field.start_date` | Start date |  |
| `calendar.create_event.field.start_time` | Start time |  |
| `calendar.create_event.field.timezone` | Time zone |  |
| `calendar.create_event.field.title` | Title |  |
| `calendar.create_event.field.url` | URL |  |
| `calendar.create_event.kind.event` | Event |  |
| `calendar.create_event.kind.label` | Event type |  |
| `calendar.create_event.kind.reminder` | Reminder |  |
| `calendar.create_event.location.add` | Add a location |  |
| `calendar.create_event.location.no_results` | No locations |  |
| `calendar.create_event.no_options` | No options available |  |
| `calendar.create_event.notify.blocked` | Enable notifications in your browser |  |
| `calendar.create_event.notify.lead_minutes_one` | {{count}} minute before | `count` |
| `calendar.create_event.notify.lead_minutes_other` | {{count}} minutes before | `count` |
| `calendar.create_event.notify.lead_now` | At time of event |  |
| `calendar.create_event.people.no_results` | No people |  |
| `calendar.create_event.people.optional` | Optional |  |
| `calendar.create_event.placeholder.calendar` | Choose a calendar |  |
| `calendar.create_event.placeholder.conferencing` | Add conferencing |  |
| `calendar.create_event.placeholder.end` | End |  |
| `calendar.create_event.placeholder.event_type` | Choose an event type |  |
| `calendar.create_event.placeholder.location` | Search for address |  |
| `calendar.create_event.placeholder.location_level` | Choose a location |  |
| `calendar.create_event.placeholder.people` | Add people |  |
| `calendar.create_event.placeholder.start` | Start |  |
| `calendar.create_event.placeholder.url` | URL to activity |  |
| `calendar.create_event.repeat.biweekly` | Biweekly |  |
| `calendar.create_event.repeat.custom` | Custom… |  |
| `calendar.create_event.repeat.daily` | Daily |  |
| `calendar.create_event.repeat.ends` | Ends |  |
| `calendar.create_event.repeat.every` | Every |  |
| `calendar.create_event.repeat.hint.daily` | Repeats every day |  |
| `calendar.create_event.repeat.hint.dailyEvery_one` | Repeats every {{count}} day | `count` |
| `calendar.create_event.repeat.hint.dailyEvery_other` | Repeats every {{count}} days | `count` |
| `calendar.create_event.repeat.hint.monthly` | Repeats every month on day {{day}} | `day` |
| `calendar.create_event.repeat.hint.monthlyEvery_one` | Repeats every {{count}} month on day {{day}} | `count`, `day` |
| `calendar.create_event.repeat.hint.monthlyEvery_other` | Repeats every {{count}} months on day {{day}} | `count`, `day` |
| `calendar.create_event.repeat.hint.until` | {{frequency}} until {{date}} | `frequency`, `date` |
| `calendar.create_event.repeat.hint.weekly` | Repeats every week on {{weekdays}} | `weekdays` |
| `calendar.create_event.repeat.hint.weeklyEvery_one` | Repeats every {{count}} week on {{weekdays}} | `count`, `weekdays` |
| `calendar.create_event.repeat.hint.weeklyEvery_other` | Repeats every {{count}} weeks on {{weekdays}} | `count`, `weekdays` |
| `calendar.create_event.repeat.hint.yearly` | Repeats every year on {{date}} | `date` |
| `calendar.create_event.repeat.hint.yearlyEvery_one` | Repeats every {{count}} year on {{date}} | `count`, `date` |
| `calendar.create_event.repeat.hint.yearlyEvery_other` | Repeats every {{count}} years on {{date}} | `count`, `date` |
| `calendar.create_event.repeat.monthly` | Monthly |  |
| `calendar.create_event.repeat.never` | Never |  |
| `calendar.create_event.repeat.none` | Doesn’t repeat |  |
| `calendar.create_event.repeat.on` | on {{weekday}} | `weekday` |
| `calendar.create_event.repeat.on_date` | On |  |
| `calendar.create_event.repeat.onWeekdays` | On |  |
| `calendar.create_event.repeat.unit_label` | every {{count}} {{unit}} | `count`, `unit` |
| `calendar.create_event.repeat.unit.day_one` | day |  |
| `calendar.create_event.repeat.unit.day_other` | days |  |
| `calendar.create_event.repeat.unit.month_one` | month |  |
| `calendar.create_event.repeat.unit.month_other` | months |  |
| `calendar.create_event.repeat.unit.week_one` | week |  |
| `calendar.create_event.repeat.unit.week_other` | weeks |  |
| `calendar.create_event.repeat.weekly` | Weekly |  |
| `calendar.create_event.repeat.yearly` | Yearly |  |
| `calendar.create_event.save` | Save |  |
| `calendar.create_event.saving` | Saving… |  |
| `calendar.create_event.submitError` | Unable to create event |  |
| `calendar.create_event.weekday.friday` | Friday |  |
| `calendar.create_event.weekday.monday` | Monday |  |
| `calendar.create_event.weekday.saturday` | Saturday |  |
| `calendar.create_event.weekday.sunday` | Sunday |  |
| `calendar.create_event.weekday.thursday` | Thursday |  |
| `calendar.create_event.weekday.tuesday` | Tuesday |  |
| `calendar.create_event.weekday.wednesday` | Wednesday |  |

<!-- /generated -->

<!-- generated:messages calendar.dateField -->

| Translation ID                    | English       | Values |
| --------------------------------- | ------------- | ------ |
| `calendar.dateField.chooseDate`   | Choose date   |        |
| `calendar.dateField.clear`        | Clear date    |        |
| `calendar.dateField.openCalendar` | Open calendar |        |

<!-- /generated -->

## Related

- [WeekGrid](../week-grid/week-grid.md)
- [DayGrid](../day-grid/day-grid.md)
- [Customization](../../docs/customization.md)
- [Recipes](../../docs/recipes.md)
