# Extension-domain routing ownership

## Decision

`@gears-frontx/mfes` owns the runtime's router port (`RouterPort`) and no
routing grammar of its own: it presents every domain and extension
registration to whichever router the host injects, carries an extension's
occupant value through a private rendezvous reached only by the extension's
own copy of the package, and reports each settled `mount_ext`/`unmount_ext`
execution to that router. It derives no route token and validates no route
name itself.

`@gears-frontx/framework` owns the concrete router — `FrameworkRouter`
(`packages/framework/src/plugins/microfrontends/router.ts`) — the template's
own implementation of that port: route admission and page-wide route
uniqueness, the extension-token derivation from an extension's own declared
`route`/`presentation.route`, the per-domain URL observer, translating URL
changes into `mount_ext`/`unmount_ext` chains, and reflecting every settled
action back into the URL. `microfrontends()` injects this one router into
every registry it builds, shell and every MFE's own `createFrontX()` alike.

The template shell and every MFE own only composition: which domains they
register, and rendering `@gears-frontx/react`'s `ExtensionDomainSlot` for
each one — the slot owns a routed domain's own URL observer, starting and
stopping it from its own attach/detach; `app.mfeRouter` itself exposes only
the extension-local navigation facade (`navigation()`), never `startDomain`/
`stopDomain`. No application code builds its own entry-address
coordinator, broadcasts an address as a shared property, or back-projects a
URL entry itself.

## Rationale

MFES is intentionally type-format and browser-runtime agnostic. Moving URL
projection, history mutation, or lifecycle observation there would introduce a
forbidden MFES-to-routing dependency and break that boundary. The router port
is how MFES stays free of that dependency while still letting a template
supply one concrete, host-wide router; `FrameworkRouter` is that supply,
reusable across the shell and every MFE's own app instance rather than
duplicated per host.

## Required behavior

- No shared property broadcasts an occupant's address; an occupant reaches
  its own address only through the runtime's occupant-value rendezvous, by
  building its own `microfrontends()`-bearing app.
- A domain's own URL-entry observer starts and stops only from its own DOM
  slot's attach/detach — never automatically at domain registration.
- `FrameworkRouter` derives a settled action's URL reflection from the
  domain's current mounted set compared against its current URL entries, not
  from a cardinality flag it tracks separately.
- A departing host's own nested routed domains — recursively, to any nesting
  depth — have their URL entries cleared in the same write as the parent
  action that removed or replaced it.
- Demo-MFE teardown waits for in-flight mounts, attempts every release, and
  always tears down its React root.
- A rejected extension teardown clears the MFE runtime's mounted-set before
  propagating its lifecycle error, and clears strategy-owned container hooks,
  so a fresh host may mount it again.

## Non-goals

- Do not add a browser-routing dependency to MFES; the router port is the one
  contact surface between the runtime and a concrete router.
- Do not change the GTS schema fields already declared by `@gears-frontx/gts-plugin`.
- Non-blocking review comments remain follow-up work unless naturally resolved
  by the changes above.
