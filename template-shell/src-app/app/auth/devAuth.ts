/**
 * The development auth wiring both shell entries share.
 *
 * `main.tsx` and `main.no-uikit.tsx` build the same shell over different UI
 * kits, and the auth plugin, the realm sharing and the sign-in triggers are
 * the same in both. They live here once, so an edit to one of them cannot miss
 * the other: a project that adds `frontxApi` for a cookie session to a copy in
 * one entry only would leave the other entry's `authRealm()` joins binding
 * their REST transports without the cookie credentials and CSRF header.
 *
 * A project edits this file alone: the provider, its `frontxApi` config and
 * the `import.meta.env.DEV` condition are the one place a real provider
 * replaces the development one.
 */

import {
  auth,
  authRealm,
  type AuthPluginConfig,
  type FrontXApp,
  type FrontXPlugin,
} from '@gears-frontx/react';
import { createDevMockAuthProvider } from './devMockAuthProvider';
import { removeSignInEntryAtPageLoad, wireSignInTriggers } from './signInTriggers';

/**
 * The development auth provider: on in development, like mock mode, and the
 * only auth the template ships. A production build passes no auth config, so
 * the auth plugin, the realm sharing and the trigger wiring are all absent
 * from it, and the one sign-in thing it still does is remove a sign-in entry
 * the page-load address named (`removeSignInEntryAtPageLoad`). A project with
 * a cookie session adds `frontxApi` (cookie origins and the CSRF header name)
 * to this one config; both plugins below read it from here.
 */
export const devAuthConfig: AuthPluginConfig | undefined = import.meta.env.DEV
  ? { provider: createDevMockAuthProvider() }
  : undefined;

/**
 * The plugins the shell adds for the realm's auth runtime, or an empty list
 * when the build has no auth config.
 *
 * `authRealm()` publishes the auth runtime the auth plugin built into the
 * realm slot, so a microfrontend of the page joins the same session through
 * `authRealmShared()` instead of signing in on its own. It takes the same
 * `frontxApi` as `auth()`: a join binds its own REST transport with the cookie
 * credentials and CSRF header the shell's requests carry, and a host that
 * published none would leave every MFE request without them.
 */
export function devAuthPlugins(): FrontXPlugin[] {
  if (!devAuthConfig) return [];
  return [auth(devAuthConfig), authRealm({ frontxApi: devAuthConfig.frontxApi })];
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
