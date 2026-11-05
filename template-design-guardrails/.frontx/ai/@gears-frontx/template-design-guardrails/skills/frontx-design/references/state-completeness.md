# State completeness

A screen built for its happy path breaks the first time data is slow,
missing or wrong. The gates are STA-001 to STA-008 in
`rules/quality-gates.json`; this file says what each state shows and how to
check it.

## Data regions

A data region is any part of the screen that shows its own set of data: a
table, a list, a chart, a KPI set, a detail panel, a form that loads values.
Regions fed by one request may share loading and error, but empty and full
are decided from each region's own data: one response can hold a populated
KPI summary and an empty filtered list.

List the regions before building (`templates/state-inventory.md`). Every
region has four states (STA-004). A state that cannot occur is not skipped
silently: the inventory says why (a settings form that always has defaults
has no empty state).

## The four states

| State | Must show | Must not show | Gate |
|---|---|---|---|
| Loading | Kit skeletons in the region's final footprint, so nothing jumps on arrival; an accessible busy status for the region. Skeletons only for predictable shapes. | A page-wide spinner, a blank region, a layout shift on arrival. | STA-005 |
| Empty | The kit empty state: one line on what is missing and why, and one action when a next step exists (create the first item, clear the filter). A filter or search that matches nothing says so, keeps the active filters visible and offers to clear them. | A table with headers only, invented sample data, an illustration in place of the reason. | STA-006 |
| Error | The error inside the failing region: what failed, what still works, retry when the failure is transient; the rest of the screen stays usable (STA-001 for scope and recovery). | A whole-screen error for one region, raw error text or codes as the only message, a lost form value. | STA-007 |
| Full | Realistic volume: long names truncate with the full value reachable, long text wraps, many rows paginate or scroll inside the region, large numbers keep their format. | A layout tuned to three short demo rows that breaks on real data. | STA-008 |

Empty and error together tell apart: no data, no matching data, missing
permission and failed loading.

## Other states

Add a column to the inventory for each state the data or actions can
produce (STA-002, STA-003): selected and focused; partial or stale (keep the
last trustworthy value, show its age, name what failed); restricted
(missing permission, said as such); offline or unavailable; validation
error; submitting or pending (no duplicate submission, a clear status);
success (confirms the changed entity and stays long enough to read);
destructive confirmation and its completion. Build the state model and
representative renders; not every state needs its own screen.

## How to check

1. Force each state per region, not only the one the dev data gives. The
   blank MFE scaffold's API service has mocks (`src/api/mocks.ts`): add a mock
   per state (slow, empty, failing, large) rather than editing the screen.
2. Render each state in the running app inside the shell, in both themes.
3. Loading: the loading capture keeps the size and position of the full one.
4. Error: fail one region while the others load; the others stay usable.
5. Full: the longest realistic strings and largest realistic counts, at 390
   CSS px as well as 1440.
6. The runner in `references/verify.md` sweeps menu entries, themes and
   widths on whatever data the screen loads; it does not switch data states.
   Check each forced state with that file's manual protocol
   (`window.__frontxDesignDefects()` per state).
7. Record each region and state in the inventory as observed, waived with
   the recorded reason, n/a with why, or unverified.
