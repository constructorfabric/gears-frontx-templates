# RecurrenceScopeDialog

`RecurrenceScopeDialog` asks which events of a recurring series a change applies to. It offers "This event", "This and following events" and "All events". The kit changes no event. It reports the chosen scope through `onConfirm`, and the host applies it.

```tsx
<RecurrenceScopeDialog
  open={scopeDialogOpen}
  action="delete"
  onConfirm={(scope) => {
    deleteEvents(scope);
    setScopeDialogOpen(false);
  }}
  onCancel={() => setScopeDialogOpen(false)}
/>
```

- `open` shows or hides the dialog. Each time it opens, "This event" is selected.
- `action` picks the title and the confirm label. `edit` reads "Edit recurring event" and "Save", `move` reads "Move recurring event" and "Update", and `delete` reads "Delete recurring event" and "Delete". The delete button uses the danger style.
- `onConfirm(scope)` receives `"occurrence"`, `"following"` or `"series"`. The dialog does not close itself, so set `open` to false in the handler.
- `onCancel()` runs for the Cancel button, the close control and Escape.

Strings resolve under `calendar.recurrenceScope.*` in `src/i18n/en.json`.
