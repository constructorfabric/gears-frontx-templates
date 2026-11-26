// @cpt-flow:cpt-frontx-flow-framework-composition-app-bootstrap:p1

/**
 * Bootstrap Effects
 *
 * Effects for app-level bootstrap operations.
 * Following flux architecture: Listen to events from actions, dispatch to slices.
 */

import trim from 'lodash/trim';
import {
  AuthEvents,
  eventBus,
  apiRegistry,
  type AppDispatch,
  type AuthRuntime,
} from '@gears-frontx/react';
import { clearUser, setUser, setHeaderLoading, type HeaderUser } from '@/app/layout/state';
import { AccountsApiService, type ApiUser } from '@/app/api';
import { readOnProviderInUse } from '@/app/auth/signIn';
import { applyProfileLanguage } from '@/app/i18n/languagePersistence';

/**
 * Convert API user to header user info
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
function toHeaderUser(user: ApiUser): HeaderUser {
  const displayName = trim(`${user.firstName || ''} ${user.lastName || ''}`);
  return {
    displayName: displayName || undefined,
    email: user.email || undefined,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Register bootstrap effects
 * Called once during app initialization
 *
 * @param auth - The app's auth runtime, when the app was built with `auth()`:
 *   the user is fetched only while its session check does not say signed out
 */
export function registerBootstrapEffects(appDispatch: AppDispatch, auth?: AuthRuntime): void {
  // Store dispatch for use in event listeners
  const dispatch = appDispatch;

  // Bumped by every `auth/loggedOut` and `auth/loggedIn`: a user fetch keeps
  // the value it started with, and its answer (the user, the profile
  // language, the end of the header's loading state) lands only while the
  // value is unchanged. So a fetch that was in flight when the session ended,
  // or when another account signed in without a reload (a provider report,
  // another tab, an account switch), cannot put its user or the profile
  // language in the header of the session that holds now, nor end the
  // loading state of a newer fetch. Both events clear the header user, which
  // ends its loading state too, and both ask for the user again, so the
  // header names the account that holds now, or nobody once the session is
  // gone.
  let sessionEpoch = 0;

  // Whether the page is signed out, for a screen's `app/user/loaded`: raised
  // by `auth/loggedOut` and by the fetch's session check answering signed out
  // (a page loaded without a session, whose start announces nothing),
  // lowered by `auth/loggedIn` and by the check answering signed in. While
  // it is up, no screen puts a user in the header.
  let signedOut = false;

  // Listen for 'app/user/fetch' event
  eventBus.on('app/user/fetch', async () => {
    const epoch = sessionEpoch;
    let headerLoadingStarted = false;
    try {
      // Check if accounts service is registered before trying to use it
      if (!apiRegistry.has(AccountsApiService)) {
        // Accounts service not registered - skip user fetch
        return;
      }

      dispatch(setHeaderLoading(true));
      headerLoadingStarted = true;

      // A page loaded without a session fetches no user: the mock API answers
      // the current-user request with its user whether a session exists or
      // not, so the header would name someone while the sign-in window is up.
      // A check that cannot answer says nothing, and the fetch goes on. An
      // answer taken across a session change is not the page's state, so it
      // moves no flag. A signed-out answer also clears the header user: a
      // screen's `app/user/loaded` may have set one while the check was out.
      if (auth) {
        const result = await readOnProviderInUse(auth, () => auth.checkAuth()).catch(() => undefined);
        if (result && epoch === sessionEpoch) signedOut = !result.authenticated;
        if (result && !result.authenticated && epoch === sessionEpoch) dispatch(clearUser());
        if (result && !result.authenticated) return;
      }

      // Get accounts service using class-based registration
      const accountsService = apiRegistry.getService(AccountsApiService);
      const response = await accountsService.getCurrentUser.fetch();
      if (response?.user && epoch === sessionEpoch) {
        dispatch(setUser(toHeaderUser(response.user)));
        // Language order: a choice the shell already stored wins, so the
        // profile is the default and applies only when nothing usable is
        // stored; English stays when neither names a listed language. The
        // profile language is that default, not a choice: it applies without
        // being stored, so a later change to it still reaches the shell.
        applyProfileLanguage(response.user.language);
      }
    } catch (error) {
      console.warn('Failed to fetch user:', error);
    } finally {
      // A fetch the session moved past leaves the loading state to the
      // session event that cleared the user and to the fetch it started.
      if (headerLoadingStarted && epoch === sessionEpoch) {
        dispatch(setHeaderLoading(false));
      }
    }
  });

  // Listen for 'app/user/loaded' event - updates header when any screen loads user data
  eventBus.on('app/user/loaded', ({ user }) => {
    if (signedOut) return;
    dispatch(setUser(toHeaderUser(user)));
  });

  // The session ended, whoever ended it (the header's "Sign out", code that
  // calls `app.auth.logout()`, a provider report): the header drops its user
  // and asks for it again. The announcement may be one the session check
  // contradicts (a logout that rejected while the session lived on, a
  // provider's spurious report), and then the fetch brings the name back; on
  // a real sign-out its session check answers signed out and it requests
  // nothing.
  eventBus.on(AuthEvents.LoggedOut, () => {
    sessionEpoch += 1;
    signedOut = true;
    dispatch(clearUser());
    eventBus.emit('app/user/fetch');
  });
  // A session started without a reload (a provider report, another tab, an
  // account switch): the previous account's user goes, and the user is asked
  // for again under the new epoch.
  eventBus.on(AuthEvents.LoggedIn, () => {
    sessionEpoch += 1;
    signedOut = false;
    dispatch(clearUser());
    eventBus.emit('app/user/fetch');
  });
}
// @cpt-end:cpt-frontx-flow-framework-composition-app-bootstrap:p1:inst-1
