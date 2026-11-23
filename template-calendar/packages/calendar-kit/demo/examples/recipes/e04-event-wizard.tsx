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
