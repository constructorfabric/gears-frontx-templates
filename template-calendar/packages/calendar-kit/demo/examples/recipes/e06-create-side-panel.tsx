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
