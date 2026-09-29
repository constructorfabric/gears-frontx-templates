import React from 'react';
import { resolveNavigationHistory } from '@gears-frontx/routing';
import { adaptProviderHistory, createRootRoute, EngineProvider } from '@gears-frontx/routing-tanstack';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { readEntryAddress } from '@gears-frontx/react';

/**
 * One screen in its own router: composed over the entry the host addressed
 * for it in the entry-addresses shared property, or standalone when the host
 * broadcast none. A screen declares no routes of its own, so an undeclared
 * `route=` inside its entry reaches this router's own not-found.
 */
export function routedScreen(content: React.ReactNode, bridge: ChildMfeBridge): React.ReactElement {
  const history = adaptProviderHistory(resolveNavigationHistory(), readEntryAddress(bridge));
  const routeTree = createRootRoute({
    component: () => <>{content}</>,
    notFoundComponent: () => <p data-testid="screen-not-found">This screen has no such page.</p>,
  });
  return <EngineProvider routeTree={routeTree} history={history} />;
}
