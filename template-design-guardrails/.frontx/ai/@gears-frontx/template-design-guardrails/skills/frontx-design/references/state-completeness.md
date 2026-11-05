# State completeness

A screen built only for its happy path breaks the first time data is slow,
missing or wrong. The gates are STA-004 to STA-008 in
`reference-artifacts/quality-gates.json`; this file says what each state must
show and how to check it.

## Data regions

A data region is any part of the screen fed by its own request or data
source: a table, a list, a chart, a KPI set, a detail panel, a form that loads
existing values. Two regions fed by one request share their states but still
each show them.

List the regions before building (`templates/state-inventory.md`). Every
region gets four states (STA-004). A state that cannot occur is not skipped
silently: the inventory says why (for example, a settings form that always
has defaults has no empty state).

## The four states

| State | Must show | Must not show | Gate |
|---|---|---|---|
| Loading | Kit skeletons in the region's final footprint, so nothing jumps when data arrives; an accessible busy status for the region. | A page-wide spinner, a blank region, layout shift on arrival. | STA-005 |
| Empty | The kit empty state: one line on what is missing and why, one action when a next step exists (create the first item, clear the filter). A filter or search that matches nothing says so and offers to clear it. | A blank table with headers only, invented sample data, decorative illustration in place of the reason. | STA-006 |
| Error | The error inside the failing region: what failed, what still works, retry when the failure is transient (STA-001 for scope and recovery). The rest of the screen stays usable. | A whole-screen error for one failed region, raw error text or codes as the only message, a lost form value. | STA-007 |
| Full | Realistic volume: long names truncate with the full value reachable, long text wraps, many rows paginate or scroll inside the region, large numbers keep their format. | A layout tuned to three short demo rows that breaks on real data. | STA-008 |

Other states apply when the data can produce them: partial, stale,
restricted, pending and success (STA-002, STA-003, and the state inventory in
`guidelines/accessibility-and-states.md`). Add them as extra columns in the
inventory.

## How to check

1. Force each state per region, not only the one the dev data happens to
   give. The blank MFE scaffold's API service has mocks
   (`src/api/mocks.ts`); add a mock per state (slow, empty, failing, large)
   rather than editing the screen.
2. Render each state in the running app inside the shell, in both themes.
3. For loading, compare the loading capture with the full capture: the region
   keeps its size and position.
4. For error, fail one region while the others load: the others stay usable.
5. For full, use the longest realistic strings and the largest realistic
   counts the product has, at 390 CSS px as well as 1440.
6. Record each region and state in the inventory as observed, waived with the
   recorded reason, or unverified. The `verify-interface` runner sweeps
   routes x themes x widths only, on whatever data the screen loads; it does
   not switch data states. Render each state through the mocks above and check
   it with that skill's manual protocol (`window.__frontxDesignDefects()` per
   state).
