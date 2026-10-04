/**
 * Framework-internal entry for @gears-frontx/framework.
 *
 * Mirrors `src/testing.ts`'s own pattern (a package-root subpath carrying
 * symbols this package deliberately keeps OUT of its public entry): the
 * router's reach-through functions here build/render an extension's own
 * router tree, start/stop a routed domain's own URL observer, and read its
 * status — none of it part of `app.mfeRouter` (ADR 0036, D5/D10 — the
 * app-facing handle carries only the navigation facade). Consumed by
 * `@gears-frontx/react`'s own components (`ExtensionDomainSlot`,
 * `ExtensionRouter`, `useDomainRouteStatus`). `teardownRoutedDomain` is the
 * ordering a host would need to release a routed domain's own occupants
 * itself, strictly before its own cleanup runs — kept here for a host that
 * manages its own teardown outside `ExtensionDomainSlot`'s attach/detach,
 * but re-exported from neither package's public entry: every shipped host
 * (e.g. Widgets Host) relies on `ExtensionDomainSlot`'s own attach/detach
 * ordering instead. Never imported by MFE/app-layer code directly — that
 * boundary is what `no-raw-url-write.test.ts` enforces against this
 * package's and `@gears-frontx/react`'s own public entries.
 */

// @cpt-dod:cpt-frontx-adr-extension-routing-port:p1

// @cpt-begin:cpt-frontx-adr-extension-routing-port:p1:inst-internal-subpath-exports
export {
  buildExtensionHistory,
  startRoutedDomain,
  stopRoutedDomain,
  teardownRoutedDomain,
  routedDomainStatus,
  subscribeRoutedDomainStatus,
  type RouteObservationStatus,
} from './plugins/microfrontends/router';
// @cpt-end:cpt-frontx-adr-extension-routing-port:p1:inst-internal-subpath-exports
