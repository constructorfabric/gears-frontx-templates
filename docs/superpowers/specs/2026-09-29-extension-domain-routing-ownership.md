# Extension-domain routing ownership

## Decision

`@gears-frontx/mfes` remains the owner of generic extension-domain route identity:
it declares the optional `route` fields, reconciles `Extension.route` with screen
`presentation.route` at registration, validates route names, and exposes the
canonical extension token through `getExtensionRouteToken`.

`@gears-frontx/framework` owns reusable host-side routing implementation: the
extension-domain observer/coordinator, entry-address property schema and
helpers, and the dependency on `@gears-frontx/routing`. The coordinator must use
the MFES helper rather than read raw extension route fields.

The template shell owns only composition: base-domain instances, browser
history/route signal, slot lifecycle, and framework configuration. MFE authors
do not implement extension-domain routing reconciliation.

## Rationale

MFES is intentionally type-format and browser-runtime agnostic. Moving URL
projection, history mutation, or lifecycle observation there would introduce a
forbidden MFES-to-routing dependency and break that boundary. Leaving the
coordinator in `template-shell/src` duplicates MFES route semantics and makes a
host concern private application code. Framework is the established glue layer
for SDK packages and is the reusable boundary.

## Required behavior

- The framework registers the `entry_addresses` schema required by its base
  domains; no private template schema prerequisite remains.
- Observer-originated mounts are deduplicated while in flight and never write a
  stale URL after Back, stop/start, or a new lifecycle epoch.
- If a late observer-originated mount is no longer projected, its owner is
  released through its unmount chain when one exists, regardless of domain
  cardinality.
- Demo-MFE teardown waits for in-flight mounts, attempts every release, and
  always tears down its React root.
- A rejected extension teardown clears the MFE runtime's mounted-set before
  propagating its lifecycle error, and clears strategy-owned container hooks,
  so a fresh host may mount it again.
- Navigation guidance describes the actual bootstrap-only entry-address
  broadcast behavior.

## Non-goals

- Do not add a browser-routing dependency to MFES. The rejected-teardown
  invariant is an MFE-runtime fix and is released separately from this template
  PR; it does not add routing knowledge to MFES.
- Do not change the GTS schema fields already declared by `@gears-frontx/gts-plugin`.
- Non-blocking review comments remain follow-up work unless naturally resolved
  by the changes above.
