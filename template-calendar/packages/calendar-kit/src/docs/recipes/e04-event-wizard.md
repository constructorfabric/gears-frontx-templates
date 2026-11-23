# E4: Event wizard, step 1 of 3

A host page with a name, start and end dates, an event type select, a responsible select and a description. The kit does not provide this page.

Parts: none from the kit. The host uses its own form controls.
Props: none.

<!-- generated:example demo/examples/recipes/e04-event-wizard.tsx -->

```tsx
// demo/examples/recipes/e04-event-wizard.tsx
import { useState } from "react";

// The wizard is a host page. Kit date fields and selects are not exported, so
// the host's own form controls are used.
export function EventWizardStep() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form>
      <p>Step 1 of 3</p>
      <label>
        Name
        <input onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label>
        Starts
        <input type="date" />
      </label>
      <label>
        Ends
        <input type="date" />
      </label>
      <label>
        Event type
        <select />
      </label>
      <label>
        Responsible
        <select />
      </label>
      <label>
        Description
        <textarea
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>
      <button type="button">Cancel</button>
      <button type="submit">Next</button>
    </form>
  );
}
```

<!-- /generated -->

Rules:

- Kit date fields, selects and textareas are not exported. The host's design-system inputs go here.
- Validation and the Next action belong to the host.
