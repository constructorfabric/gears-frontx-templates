# E6: Create form in the side panel

The create-event form in the host's side panel. The form takes the host's calendars, people and locations, and returns an error to keep itself open when the host rejects a draft.

Parts: `CreateEventPanel`.
Props: `calendars`, `people`, `locations`, `conferencingProviders`, `defaultOpen`, `onCancel`, `onSubmit`, `renderFields`, `renderFooter`, `renderError`.

<!-- generated:example demo/examples/recipes/e06-create-side-panel.tsx -->

```tsx
// demo/examples/recipes/e06-create-side-panel.tsx
import { CreateEventPanel } from "@gears-frontx/calendar-kit";

// Calendars, people and locations are host lists. The form returns an error
// to keep itself open when the host rejects a draft.
export function CreateSidePanel() {
  return (
    <CreateEventPanel
      calendars={[]}
      conferencingProviders={[]}
      defaultOpen
      locations={[]}
      onCancel={() => undefined}
      onSubmit={() => undefined}
      people={[]}
    />
  );
}
```

<!-- /generated -->

Rules:

- The form renders inline in the host's side panel. The kit draws no popover or dialog for it; only the discard confirmation is an overlay.
- `onSubmit` returns `{ error }` to keep the form open. Return nothing to close it.
- The unsaved-changes guard runs on close. `onCancel` runs after a clean cancel or a confirmed discard.
- The "0 days" label is not shown at zero. It shows for one or more days.
