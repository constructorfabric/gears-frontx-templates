/**
 * The two triggers that send the shell's sign-in chain, and the one guard they
 * share.
 *
 * The chain itself is `buildSignInChain()` (`signIn.ts`): mount the sign-in
 * extension in the modal domain, wait for a session, reload the page. Nothing
 * here performs a sign-in or carries credentials - the triggers only decide
 * when the chain is sent.
 *
 * Both triggers exist only where the development auth provider is wired
 * (`main.tsx`, `main.no-uikit.tsx`, behind `import.meta.env.DEV`). A production
 * build passes no provider, wires nothing here, and the shell behaves exactly
 * as before.
 */

import type {
  AuthContext,
  AuthProvider,
  FrontXApp,
} from '@gears-frontx/react';
import { bootstrapSettled } from '@/app/mfe/bootstrapOnce';
import { modalSlotAttached } from '@/app/mfe/modalSlotAttached';
import {
  addressSignInEntry,
  buildSignInChain,
  buildSignInUnmountChain,
  invalidateRejectedSession,
} from './signIn';

/** The event type of the provider hook the 401 trigger wraps. */
type TransportErrorEvent = Parameters<NonNullable<AuthProvider['onTransportError']>>[0];

/**
 * The page-lifetime guard of the chain. One sign-in flow per page: the chain
 * ends in `refresh_page` whichever way it goes - the success tail, the
 * fallback of a failed sign_in, or the fallback of a failed mount - so the
 * reload resets the page and, with it, this guard. While the chain runs, a
 * second 401 or a second look at the start finds the guard down and sends
 * nothing, so several requests failing at once produce one chain, not one per
 * request. When the page refuses to reload (the automatic reload guard in
 * `mfe/automaticReload.ts` bounded the chain's repeats), the page is not reset
 * and this guard stays up with it, so the failed chain is not sent again on
 * the same page either.
 */
let chainSent = false;

/**
 * Sends the chain once, and only once the page can actually mount it.
 *
 * The wait is the race the live walk of the sign-in modal lost (issue 112):
 * the chain went out as soon as the bootstrap settled, while the modal
 * domain's slot attaches its root to the mounter only on a later React commit,
 * so `mount_ext` failed with "no root attached for domain" and the chain's
 * fallback reloaded the page into the same failure again. Both triggers
 * therefore wait for the bootstrap (the domains the chain names exist) and for
 * the modal slot's attachment signal (`modalSlotAttached`, resolved by
 * `MfeScreenContainer`'s dialog layer) before the chain goes.
 *
 * A bootstrap that fails burns the guard: `bootstrapOnce` deliberately never
 * resets a failed bootstrap, so a released guard could only buy one more pass
 * through the same rejection. The guard stays up, and each path warns at most
 * once for the rest of the page's life: the start-up check for its own failed
 * bootstrap, and a 401's chain send for the same failure it then runs into.
 */
async function sendSignInChainOnce(app: FrontXApp): Promise<void> {
  if (chainSent) return;
  chainSent = true;
  try {
    await Promise.all([bootstrapSettled(), modalSlotAttached()]);
  } catch (error) {
    console.warn('[signInTriggers] the bootstrap failed, so no sign-in chain was sent', error);
    return;
  }
  // The session that led here is rejected: end it before the modal mounts, so
  // `sign_in` waits for a new sign-in instead of taking it for one.
  if (app.auth) await invalidateRejectedSession(app.auth);
  app.mfeRegistry?.executeActionsChain(buildSignInChain());
}

/**
 * The startup trigger: once the MFE bootstrap has settled - the domains are
 * registered and the manifest walk has admitted the extensions, so the chain
 * can actually mount the sign-in modal - a host with an auth runtime asks it
 * whether a session exists. Signed out means the same page state a 401 leaves,
 * so the same chain answers it. Signed in with the sign-in extension still
 * named in the address - a deep link, or an address an earlier sign-in left
 * behind - has the entry removed instead (`removeSignInEntryAtStart`), so no
 * modal opens over a session that exists. A host without an auth runtime - the
 * production build - sends nothing.
 *
 * @param app - The FrontX application whose registry the chain is sent to
 * @param addressNamedSignIn - Whether the page-load address named the sign-in
 *   extension, read by the caller before anything could rewrite the address
 */
async function checkSessionAtStart(app: FrontXApp, addressNamedSignIn: boolean): Promise<void> {
  try {
    await bootstrapSettled();
    // A host without an auth runtime - the production build - checks nothing.
    const auth = app.auth;
    if (!auth) return;
    const result = await auth.checkAuth().catch((error: unknown) => {
      // A check that cannot answer says nothing about the session. Nothing
      // here sets the once-guard, so a later 401 can still send the chain.
      console.warn(
        '[signInTriggers] the start-up session check did not answer; no sign-in chain sent',
        error,
      );
      return undefined;
    });
    if (!result) return;
    if (!result.authenticated) await sendSignInChainOnce(app);
    else if (addressNamedSignIn) await removeSignInEntryAtStart(app);
  } catch (error) {
    // The bootstrap failed, so the domains the chain names may not exist and
    // the session check did not run. Nothing here sets the once-guard either,
    // so a later 401 can still try; its send then meets the same one-shot
    // bootstrap and keeps its guard up (`sendSignInChainOnce`).
    console.warn(
      '[signInTriggers] the start-up bootstrap failed, so no session check ran',
      error,
    );
  }
}

/**
 * Removes the sign-in entry the page-load address carried, once a session
 * already exists: the unmount chain of `buildSignInUnmountChain` (`signIn.ts`)
 * goes out with the `replace` history intent, so the address loses
 * `?popup=sign-in` and no modal opens over the session.
 *
 * The send waits for the modal slot's attachment signal, because the popup
 * domain's own page-load step has dispatched by then: the slot's root attach
 * starts the routed domain, whose first transition reads the address and
 * dispatches the `mount_ext` the sign-in entry asks for, all before the slot's
 * `onAttached` reports the root (`modalSlotAttached`). Dispatched after that,
 * the unmount joins the popup domain's occupancy queue behind that mount, so
 * whatever the address asked to mount is unmounted again instead of racing it;
 * an entry that mounted nothing leaves the unmount a no-op. No reload follows:
 * the page's own requests ran with the session, so there is nothing to repeat.
 */
async function removeSignInEntryAtStart(app: FrontXApp): Promise<void> {
  await modalSlotAttached();
  app.mfeRegistry?.executeActionsChain(buildSignInUnmountChain());
}

/**
 * The 401 trigger: a request that failed with 401 opens the sign-in modal,
 * unless the transport can still recover the request. The hook runs as an
 * informational call before the transport plugin's refresh decision (`auth.ts`
 * calls it "before retry decisions"), so a 401 here does not yet mean the
 * session is gone. When the provider carries a `refresh`, the trigger first
 * lets the transport's refresh flight for that 401 settle and then asks the
 * runtime whether a session really remains (`app.auth.checkAuth()`), sending
 * the chain only for a signed-out answer: a check started at hook time would
 * run alongside the flight and answer from the state the flight is about to
 * replace, so a stale read held the modal back for a session whose refresh
 * then failed, or opened it for one the flight recovered. A check that
 * rejects or never answers sends nothing, since it says as little about the
 * session as the hook does, and says so with the warning the start-up path
 * gives. Without a refresh there is nothing that could recover the request,
 * so the 401 is the answer and the chain goes out at once. Once the guard is
 * up (`chainSent`) neither happens: the chain cannot go out again, so the 401
 * has nothing left to confirm or send. The hook is wrapped rather than
 * replaced, so a provider that reports transport errors itself keeps doing
 * so; the wrap happens after the app is built and takes effect for every
 * later call, since the transport plugin reads the hook off the provider at
 * error time. The chain itself goes out only once the page can mount it - the
 * bootstrap has settled and the modal domain's slot has attached its root
 * (`sendSignInChainOnce`).
 *
 * @param app - The FrontX application whose registry the chain is sent to
 * @param provider - The provider the app's auth plugin was built with
 */
export function wireSignInTriggers(app: FrontXApp, provider: AuthProvider): void {
  // The page-load address is read here, before anything can rewrite it: this
  // wiring runs before the first render, and the router clears every entry
  // from the address once the first routed domain starts - a step of the
  // render this call precedes.
  const addressNamedSignIn = addressSignInEntry() !== undefined;
  const previous = provider.onTransportError?.bind(provider);

  // The transport starts every 401 refresh flight by calling the provider's
  // `refresh` (`auth.ts` reads it off the provider at error time), so a wrap
  // installed here, after the app is built, is what every later flight goes
  // through. The wrap only observes: the call and its result reach the
  // provider untouched, and the flight in progress is remembered so the 401
  // confirmation below can wait it out instead of racing it. The auth
  // runtime's own `refresh` is wrapped the same way: the microfrontends that
  // join the runtime (`authRealmShared`) refresh through it, so the host's
  // session tracker hears of their flights, and it calls the original the
  // auth plugin captured at build time, so no flight is seen twice.
  let refreshFlight: Promise<unknown> | null = null;
  const observeFlights = <T>(refresh: (ctx?: AuthContext) => Promise<T>) =>
    (ctx?: AuthContext): Promise<T> => {
      const flight = refresh(ctx);
      refreshFlight = flight;
      const forget = (): void => {
        if (refreshFlight === flight) refreshFlight = null;
      };
      void flight.then(forget, forget);
      return flight;
    };
  const refresh = provider.refresh?.bind(provider);
  if (refresh) provider.refresh = observeFlights(refresh);
  const runtimeRefresh = app.auth?.refresh;
  if (app.auth && runtimeRefresh) app.auth.refresh = observeFlights(runtimeRefresh);

  // One confirmation at a time. The check can travel the same REST transport
  // the 401 came from, so its own 401 fires this hook again while the first
  // check is still out, and a burst of failing requests fires the hook once
  // per request; the confirmation already running answers them all, and no
  // second check starts behind it.
  let confirmation: Promise<void> | null = null;

  /** Asks the runtime once the transport's refresh for the 401 has settled. */
  const confirmSessionGone = (): void => {
    if (confirmation) return;
    const settled = (): void => {
      confirmation = null;
    };
    confirmation = (async () => {
      // One tick before the flight is read: the transport starts or joins its
      // flight in the same tick the hook returns in, before its first await,
      // so the flight the 401 will get is tracked by then. No flight tracked
      // means the transport did not refresh (its budget is spent, or this 401
      // rode a retried request), and the state the last flight left is the
      // one to ask about the session.
      await Promise.resolve();
      if (refreshFlight) await refreshFlight.catch(() => undefined);
      const result = await app.auth?.checkAuth().catch((error: unknown) => {
        console.warn(
          '[signInTriggers] the 401 session check did not answer; no sign-in chain sent',
          error,
        );
        return undefined;
      });
      if (!result) return;
      if (!result.authenticated) await sendSignInChainOnce(app);
    })();
    void confirmation.then(settled, settled);
  };

  provider.onTransportError = (event: TransportErrorEvent): void => {
    previous?.(event);
    if (event.status !== 401) return;
    // The guard is up: the chain cannot go out again, so there is nothing
    // left to confirm and nothing to send.
    if (chainSent) return;
    // The hook runs before the transport's refresh-and-retry; with a refresh
    // available, confirm the session is really gone before opening the modal,
    // once the transport's refresh flight has settled.
    if (refresh && app.auth) {
      confirmSessionGone();
      return;
    }
    void sendSignInChainOnce(app);
  };
  void checkSessionAtStart(app, addressNamedSignIn);
}
