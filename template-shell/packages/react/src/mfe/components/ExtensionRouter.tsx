/**
 * Extension Router Component (ADR 0036, D5)
 *
 * The framework-provided rendering path an MFE's own `createFrontX()` app
 * uses to build and render ITS OWN router: "An MFE ... supplies its route
 * tree to its own framework instance ... which builds and renders that
 * extension's one router." An extension declares only its own route tree
 * (via `@gears-frontx/routing-tanstack`'s `createRootRoute`/`createRoute`)
 * and renders `<ExtensionRouter registry={app.mfeRegistry} routeTree={...} />`
 * — it never imports `createProviderRouter`, `adaptProviderHistory`, or
 * `EngineProvider` itself, and never reaches an occupant's own entry
 * address or raw history: `buildExtensionHistory` (framework-internal,
 * reached only from here) resolves the adapted history for the registry's
 * own `FrameworkRouter`.
 *
 * @packageDocumentation
 */
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { createProviderRouter, EngineProvider, type AnyRoute } from '@gears-frontx/routing-tanstack';
import type { MfeRegistry } from '@gears-frontx/framework';
// Framework-internal reach-through (never MFE-reachable) — resolves this
// registry's own `FrameworkRouter`'s adapted history; never the raw history
// or occupant value itself.
import { buildExtensionHistory } from '@gears-frontx/framework/internal';

export interface ExtensionRouterProps {
  /** The registry built by this extension's own `createFrontX().use(microfrontends({...})).build()` call — its injected `FrameworkRouter` is what supplies this router's adapted history. */
  registry: MfeRegistry;
  /**
   * This extension's own route tree (`createRootRoute`/`createRoute`,
   * `@gears-frontx/routing-tanstack`). Typed as `AnyRoute` rather than a
   * generic parameter: `createProviderRouter`'s own trailing options
   * parameter is conditionally required depending on whether the route
   * tree declares a router context — a condition only a CONCRETE route
   * tree resolves (`router-creation.tsx`'s own doc comment). No extension
   * built through this component declares a router context today; one that
   * did would need its own typed call to `createProviderRouter` instead of
   * this component.
   */
  routeTree: AnyRoute;
}

export function ExtensionRouter({ registry, routeTree }: ExtensionRouterProps): ReactElement {
  // Resolved once per (registry, routeTree) pair: a fresh render over a new
  // route tree instance is a real route-tree change, but this extension's
  // own re-renders of an unchanged tree must not rebuild the router or
  // reattach its adapted history every time.
  const history = useMemo(() => {
    const resolved = buildExtensionHistory(registry);
    if (!resolved) {
      throw new Error(
        '[ExtensionRouter] the given registry has no FrameworkRouter attached — build it with microfrontends()',
      );
    }
    return resolved;
  }, [registry]);

  const router = useMemo(() => createProviderRouter(routeTree, history), [routeTree, history]);

  return <EngineProvider router={router} />;
}
