/**
 * Collects nested domain-teardown promises synchronously raised while
 * `ThemeAwareReactLifecycle.unmount()` runs `Root.unmount()`.
 *
 * `Root.unmount()` is synchronous, but it runs every unmounting effect's own
 * cleanup synchronously as part of that same call — including
 * `ExtensionDomainSlot`'s own cleanup, which fire-and-forgets its mounter's
 * `detach()` (async: it awaits per-extension unmounts) because React
 * cleanup itself cannot be async. Left alone, the surrounding lifecycle's
 * own `unmount()` would then resolve while nested occupants are still
 * mid-teardown.
 *
 * This module closes that gap without a new public prop on
 * `ExtensionDomainSlot` and without `ThemeAwareReactLifecycle` reaching into
 * React internals: `ThemeAwareReactLifecycle.unmount()` opens a collector
 * before calling `Root.unmount()`, `ExtensionDomainSlot`'s cleanup (any
 * depth beneath that root — `Root.unmount()` unmounts the whole subtree in
 * one synchronous pass) registers its own detach promise into whichever
 * collector is currently open, and `unmount()` awaits everything collected
 * before it resolves. Module-scoped rather than per-call state because the
 * two call sites live in different files of this SAME package (no
 * cross-package externalization boundary to defend against, unlike the
 * router's own realm-global rendezvous) and only one `Root.unmount()` call
 * is ever in flight at a time (JS is single-threaded; nothing re-enters this
 * module between a collector opening and closing).
 *
 * @packageDocumentation
 */

let activeCollector: Promise<void>[] | undefined;

/**
 * Runs `fn` with a fresh collector active, and returns whatever
 * `fn` registered through {@link registerDomainTeardown} while it ran.
 * Nested calls (an unmount triggered from within another unmount, e.g. a
 * remount's own cleanup) restore the outer collector afterward rather than
 * losing it.
 */
export function collectDomainTeardowns(fn: () => void): Promise<void>[] {
  const previousCollector = activeCollector;
  const collector: Promise<void>[] = [];
  activeCollector = collector;
  try {
    fn();
  } finally {
    activeCollector = previousCollector;
  }
  return collector;
}

/**
 * Registers a nested domain's own teardown promise with whichever collector
 * is currently open. A no-op outside `collectDomainTeardowns` (e.g. a
 * registry with no `ThemeAwareReactLifecycle` owning this React root, such
 * as a bare `createRoot(...).unmount()` in a test) — the promise still runs
 * to completion on its own; nothing here awaits it, so it is still the
 * caller's `void`.
 */
export function registerDomainTeardown(promise: Promise<void>): void {
  activeCollector?.push(promise);
}
