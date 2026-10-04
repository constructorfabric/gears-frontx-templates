/**
 * FrontX Provider - Main provider component for FrontX applications
 *
 * React Layer: L3 (Depends on @gears-frontx/framework)
 *
 * Query cache lifecycle is owned by the queryCache() framework plugin (L2).
 * FrontXProvider reads the plugin-owned QueryClient from the app and mounts the
 * internal React provider around the tree when it is available.
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-bootstrap-provider:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-resolve-app:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-build-provider-tree:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-provider:p1
// @cpt-dod:cpt-frontx-dod-request-lifecycle-query-provider:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
// @cpt-FEATURE:implement-endpoint-descriptors:p3

import React, { useEffect } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import type { Store } from '@reduxjs/toolkit';
import { FrontXContext } from './FrontXContext';
import { MfeProvider } from './mfe/MfeProvider';
import {
  hasFrontXQueryClientActivator,
  FrontXQueryClientProvider,
  useBootstrappedFrontXQueryClient,
} from './queryClient';
import type { FrontXProviderProps } from './types';

/**
 * FrontX Provider Component
 *
 * Provides the FrontX application context to all child components. The app
 * is built once per runtime by the caller (`createFrontX(...).build()`); the
 * provider never creates or destroys one.
 *
 * @example
 * ```tsx
 * const app = createFrontX().use(queryCache()).build();
 * <FrontXProvider app={app}>
 *   <App />
 * </FrontXProvider>
 *
 * // With MFE bridge (for MFE components)
 * <FrontXProvider app={app} mfeBridge={{ bridge, extensionId, domainId }}>
 *   <MyMfeApp />
 * </FrontXProvider>
 *
 * // QueryCache is resolved from the app's plugin composition
 * <FrontXProvider app={app}>
 *   <MyMfeApp />
 * </FrontXProvider>
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-provider
// @cpt-begin:cpt-frontx-dod-react-bindings-provider:p1:inst-render-provider
// @cpt-begin:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-render-provider
export const FrontXProvider: React.FC<FrontXProviderProps> = ({
  children,
  app,
  mfeBridge,
}) => {
  const queryClient = useBootstrappedFrontXQueryClient(app);
  const deferQuerySubtree =
    hasFrontXQueryClientActivator(app) && queryClient === undefined;

  useEffect(() => {
    if (
      queryClient ||
      hasFrontXQueryClientActivator(app) ||
      process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true'
    ) {
      return;
    }

    console.warn(
      '[FrontXProvider] No query cache available. Add queryCache() or queryCacheShared() to your plugin composition. ' +
      'useApiQuery/useApiMutation will fail without it.'
    );
  }, [app, queryClient]);

  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-frontx-context
  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-redux
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-frontx-context
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-redux-provider
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-query-provider
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-children
  // @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-render-query-provider
  // Provider order (outer to inner):
  //   FrontXContext -> ReduxProvider -> QueryClientProvider -> children
  // queryCache()/queryCacheShared() own the shared QueryClient lifecycle.
  const content = (
    <FrontXContext.Provider value={app}>
      <ReduxProvider store={app.store as Store}>
        {/* app.store is FrontX-owned but Redux-compatible. Cast keeps react-redux happy. */}
        <FrontXQueryClientProvider queryClient={queryClient}>
          {deferQuerySubtree ? null : children}
        </FrontXQueryClientProvider>
      </ReduxProvider>
    </FrontXContext.Provider>
  );
  // @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-render-query-provider
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-children
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-query-provider
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-redux-provider
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-frontx-context
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-redux
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-frontx-context

  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-mfe-conditional
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p2:inst-wrap-mfe-provider
  // Wrap with MfeProvider if bridge is provided
  if (mfeBridge) {
    return (
      <MfeProvider value={mfeBridge}>
        {content}
      </MfeProvider>
    );
  }
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-mfe-conditional
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p2:inst-wrap-mfe-provider

  return content;
};
// @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-provider
// @cpt-end:cpt-frontx-dod-react-bindings-provider:p1:inst-render-provider
// @cpt-end:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-render-provider
