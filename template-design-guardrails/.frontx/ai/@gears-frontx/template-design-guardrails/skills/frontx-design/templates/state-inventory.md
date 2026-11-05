# State inventory: <screen name>

Screen: `<package>/src/screens/<screen>/` | Route: `<route>` | Date: <YYYY-MM-DD>

One row per data region (`references/state-completeness.md`). In each state
cell write one of: `observed` (seen rendered; add the width and theme),
`waived: <recorded reason>`, `n/a: <why the state cannot occur>`, or
`unverified`. Regions fed by one request may share their loading and error
cells; judge empty and full from each region's own data.

| Region | Data source | Loading (STA-005) | Empty (STA-006) | Error (STA-007) | Full (STA-008) | Other states | How checked |
|---|---|---|---|---|---|---|---|
| <region> | <request or store> | | | | | <partial, stale, restricted, pending, success as applicable> | <mock, fixture, live data> |

Widths seen (APP-005): 1440 <observed or unverified>, 768 <...>, 390 <...>, 320 <...>
Themes seen: light <...>, dark <...>
