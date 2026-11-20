/**
 * The development auth wiring both shell entries share.
 *
 * `main.tsx` and `main.no-uikit.tsx` build the same shell over different UI
 * kits, and the auth plugin and the sign-in triggers are the same in both.
 * They live here once, so an edit to one of them cannot miss the other: a
 * project that adds `frontxApi` for a cookie session to a copy in one entry
 * only would leave the other entry, and every microfrontend that joins it,
 * without the cookie credentials and CSRF header.
 *
 * A project edits this file alone: the provider, its `frontxApi` config and
 * the `import.meta.env.DEV` condition are the one place a real provider
 * replaces the development one.
 */

import {
  auth,
  type AuthPluginConfig,
  type FrontXApp,
  type FrontXPlugin,
} from '@gears-frontx/react';
import { createDevMockAuthProvider } from './devMockAuthProvider';
import { removeSignInEntryAtPageLoad, wireSignInTriggers } from './signInTriggers';

/**
 * The development auth provider: on in development, like mock mode, and the
 * only auth the template ships. A production build passes no auth config, so
 * the auth plugin and the trigger wiring are both absent
 * from it, and the one sign-in thing it still does is remove a sign-in entry
 * the page-load address named (`removeSignInEntryAtPageLoad`). A project with
 * a cookie session adds `frontxApi` (cookie origins and the CSRF header name)
 * to this one config; the auth plugin publishes it for the whole page.
 */
export const devAuthConfig: AuthPluginConfig | undefined = import.meta.env.DEV
  ? { provider: createDevMockAuthProvider() }
  : undefined;

/**
 * The auth plugin the shell adds, or an empty list when the build has no auth
 * config.
 *
 * In this template the shell passes the page's one provider. `auth(config)`
 * publishes the session runtime and its `frontxApi` config for the whole page,
 * so a microfrontend that adds `auth()` with no provider joins the same
 * session, and binds its own REST transport with the same config, instead of
 * signing in on its own. Nothing here makes the shell special: any one app of
 * the page could pass the provider instead.
 */
export function devAuthPlugins(): FrontXPlugin[] {
  if (!devAuthConfig) return [];
  return [auth(devAuthConfig)];
}

/**
 * Wires the sign-in triggers: a 401, or a start with no session, sends the
 * chain that opens the sign-in modal (`signInTriggers.ts`). Wired only where
 * the development auth config exists. A build without one wires no trigger -
 * there is no provider to wire one with - but an address that names the
 * sign-in entry mounts a modal whose only closer is the `sign_in` of a chain
 * nothing sends on such a host, so `removeSignInEntryAtPageLoad` removes that
 * entry.
 */
export function wireDevSignInTriggers(app: FrontXApp): void {
  if (!devAuthConfig) {
    removeSignInEntryAtPageLoad(app);
    return;
  }
  wireSignInTriggers(app, devAuthConfig.provider);
}
