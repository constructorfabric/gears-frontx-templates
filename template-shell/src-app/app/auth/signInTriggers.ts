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
 * build passes no provider and wires no trigger; the one thing it still runs
 * here is `removeSignInEntryAtPageLoad`, which removes a sign-in entry the
 * page-load address named.
 */

import type {
  AuthContext,
  AuthProvider,
  FrameworkTransportErrorEvent,
  FrontXApp,
} from '@gears-frontx/react';
import { bootstrapSettled } from '@/app/mfe/bootstrapOnce';
import { modalSlotAttached } from '@/app/mfe/modalSlotAttached';
import {
  addressSignInEntry,
  buildSignInChain,
  buildSignInUnmountChain,
  invalidateRejectedSession,
  readOnProviderInUse,
  readSessionCredentials,
} from './signIn';

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
 *
 * `chainPending` is the send's own latch, held while a send waits for the
 * bootstrap and the modal slot. A trigger that arrives beside it sends
 * nothing of its own: the running send has not compared yet, and it reads the
 * snapshot of the last confirmed trigger when it does, so the latest
 * confirmed trigger wins without a queue. The latch is released again when
 * the send decides against the chain (a newer session signed in during the
 * waits), so a 401 that may still follow can start a send of its own. A
 * bootstrap that fails turns the latch into the guard instead: the guard
 * burns, the latch does not release.
 */
let chainSent = false;
let chainPending = false;

/**
 * The credentials of the last confirmed 401, in the shape
 * `readSessionCredentials` writes: what the trigger the flight or the session
 * check confirmed read beside its 401, held as the plain value its read
 * resolved to. Every confirmed trigger assigns it once its own read settles,
 * and the latest settled assignment wins - a late 401 of a newer session
 * overwrites the snapshot of the one before it, and the send reads the
 * variable as the plain value when it compares, after the readiness waits.
 * One variable, no queue: a trigger that lands beside a waiting send is
 * judged by that send, which has not compared yet.
 *
 * The value is assigned where the read settles (`confirmSignIn`), never
 * awaited by the send: a snapshot promise a newer confirmed trigger has
 * already superseded is not the one the send judges against.
 */
let confirmed401: string | null | undefined;

/**
 * Hands the snapshot a confirmed trigger took to the send: the read is
 * awaited here, the resolved value lands in the one snapshot variable (the
 * latest settled assignment wins), and only then is the send started. The
 * send reads the variable as the plain value when it compares, so it never
 * awaits a snapshot promise a newer confirmed trigger has already
 * superseded. `readSessionCredentials` is total (a failed read resolves
 * `undefined`, which claims nothing), so the read cannot reject and needs no
 * catch here.
 */
function confirmSignIn(app: FrontXApp, snapshot: Promise<string | null | undefined>): void {
  void snapshot.then((value) => {
    confirmed401 = value;
    void sendSignInChainOnce(app);
  });
}

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
 * The comparison runs here, after the readiness waits and right before the
 * chain is sent, not where the send was decided: the modal slot can stay
 * pending for a commit or two, and a sign-in that finishes in between must
 * not be covered by the modal. The runtime's session is read once, and the
 * comparison is against the snapshot of the last confirmed trigger
 * (`confirmed401`), which every confirmed trigger assigns once its own read
 * settles, the latest settled assignment winning: a trigger that landed
 * while the waits ran, beside this send, is the snapshot the send judges
 * against, without a queue. A session with other
 * credentials than the snapshot is a newer one, the chain stays out, and the
 * latch releases so a 401 that may still follow can send against the state
 * that holds then. The same credentials, no session at all, or a snapshot
 * that could not be read (`undefined`, which claims nothing, so there is
 * nothing to compare against) is the state the chain was sent against, and
 * the dialog opens.
 *
 * The one accepted window: a confirmed 401 of a newer session that lands
 * inside this single read is judged against the snapshot read before it, so
 * the dialog can open over that newer session - the dialog then opens for it
 * on the next failed request.
 *
 * What the chain sets aside: the snapshot the confirmed trigger took, or -
 * when that snapshot could not be read (`undefined`) - the session this final
 * read returned, so the stale session a provider still hands out is set
 * aside either way and `sign_in` never takes it for a fresh sign-in
 * (`invalidateRejectedSession`).
 *
 * A bootstrap that fails burns the guard: `bootstrapOnce` deliberately never
 * resets a failed bootstrap, so a released guard could only buy one more pass
 * through the same rejection. The guard stays up, and each path warns at most
 * once for the rest of the page's life: the start-up check for its own failed
 * bootstrap, and a 401's chain send for the same failure it then runs into.
 */
async function sendSignInChainOnce(app: FrontXApp): Promise<void> {
  if (chainSent) return;
  // A send already waits for the readiness waits, so this trigger sends
  // nothing of its own: the running send has not compared yet, and it reads
  // the latest confirmed snapshot (`confirmed401`) when it does - the latest
  // confirmed trigger wins without a queue.
  if (chainPending) return;
  chainPending = true;
  try {
    await Promise.all([bootstrapSettled(), modalSlotAttached()]);
  } catch (error) {
    chainSent = true;
    chainPending = false;
    console.warn('[signInTriggers] the bootstrap failed, so no sign-in chain was sent', error);
    return;
  }
  // The snapshot of the last confirmed trigger, read where the comparison
  // needs it: whatever trigger was confirmed last by now is the one judged.
  // It is the plain value `confirmSignIn` assigned once its own read settled,
  // so nothing here awaits a snapshot promise that a newer confirmed trigger
  // has already superseded - the latest settled assignment is what is read.
  const snapshot = confirmed401;
  // The current session is read once, here, as late as the readiness waits
  // allow. The one accepted window is a confirmed 401 of a newer session
  // landing inside this single read: it is judged against the snapshot read
  // before it, and the dialog then opens for it on the next failed request.
  const current = await readSessionCredentials(app.auth);
  if (snapshot !== undefined && typeof current === 'string' && current !== snapshot) {
    // A newer session signed in while the waits ran: the modal must not
    // cover it, and the guard is not burned - the latch releases, so the
    // chain stays out for a 401 that may still follow.
    chainPending = false;
    return;
  }
  chainSent = true;
  chainPending = false;
  // The session that led here is rejected: its credentials are set aside
  // before the modal mounts, so `sign_in` waits for a new sign-in instead of
  // taking them for one. That is the snapshot the confirmed trigger took;
  // when it could not be read (`undefined`), it is the session this final
  // read returned. A sign-in that finished during the waits was turned away
  // by the comparison above, and one that finishes after this line is a
  // session the modal waits for, not one it rejects.
  invalidateRejectedSession(snapshot === undefined ? current : snapshot);
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
 * modal opens over a session that exists. A host wired without an auth runtime
 * and a check that cannot answer send nothing either, and an address that
 * names the sign-in entry has it removed there as well: the modal it mounts is
 * closed only by the `sign_in` of a chain this start never sends, so it would
 * stay up with nothing behind it. The production build runs none of this, for
 * no trigger is wired there; its page-load removal is
 * `removeSignInEntryAtPageLoad`. A bootstrap that fails is the one start that
 * keeps the entry: the session check does not run, this function only warns,
 * and the removal is skipped because the domains the unmount chain names may
 * not exist, so the unmount could not be delivered. Nothing on these paths
 * sets the once-guard, so a later 401 still opens sign-in.
 *
 * @param app - The FrontX application whose registry the chain is sent to
 * @param addressNamedSignIn - Whether the page-load address named the sign-in
 *   extension, read by the caller before anything could rewrite the address
 */
async function checkSessionAtStart(app: FrontXApp, addressNamedSignIn: boolean): Promise<void> {
  try {
    await bootstrapSettled();
    // A host wired without an auth runtime checks nothing. The production
    // build never reaches this check - it wires no trigger at all, and
    // `removeSignInEntryAtPageLoad` covers its page-load address. An address
    // that still names the sign-in entry would mount a modal whose
    // only closer is the `sign_in` no chain holds here, so the entry is
    // removed instead; nothing below sets the once-guard, so a later 401 can
    // still send the chain.
    if (!app.auth) {
      if (addressNamedSignIn) await removeSignInEntryAtStart(app);
      return;
    }
    // Run through `readOnProviderInUse`, so a check that throws
    // synchronously reaches this rejection handler too: the runtime's
    // `checkAuth` is a plain pass-through, and an unwrapped call would throw
    // out of this try and land in the bootstrap warning below, with the
    // entry the address named left in place. A check that crossed a
    // provider replacement is asked once more of the provider in use, since
    // the replaced one's answer belongs to no current session.
    const auth = app.auth;
    const result = await readOnProviderInUse(auth, () => auth.checkAuth())
      .catch((error: unknown) => {
      // A check that cannot answer says nothing about the session. Nothing
      // here sets the once-guard, so a later 401 can still send the chain.
      console.warn(
        '[signInTriggers] the start-up session check did not answer; no sign-in chain sent',
        error,
      );
      return undefined;
    });
    if (!result) {
      // A failed start sends no chain, and the entry the address names would
      // mount a modal nothing closes: the sign-in service is down, and a
      // redirect provider coming back to the address it left lands on exactly
      // this state. The entry is removed here too, with the once-guard left
      // unset for a later 401.
      if (addressNamedSignIn) await removeSignInEntryAtStart(app);
      return;
    }
    if (!result.authenticated) {
      // The credentials the chain is sent against are read here, when the
      // signed-out answer arrived - the send takes this snapshot as the
      // rejected session instead of reading again, where a sign-in that
      // finished in between would be the one it set aside.
      confirmSignIn(app, readSessionCredentials(app.auth));
    } else if (addressNamedSignIn) await removeSignInEntryAtStart(app);
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
 *
 * A chain that has already gone out changes the picture: its `mount_ext`
 * mounted the modal its `sign_in` is waiting on, and an unmount here would
 * close it with nothing to reopen it, the once-guard being up for the rest of
 * the page. Such a chain owns the sign-in entry from the moment it is sent,
 * so the removal is skipped (`chainSent`, read after the wait: a 401 of the
 * same page can confirm and send while the start-up check that led here is
 * still out).
 */
async function removeSignInEntryAtStart(app: FrontXApp): Promise<void> {
  await modalSlotAttached();
  if (chainSent) return;
  app.mfeRegistry?.executeActionsChain(buildSignInUnmountChain());
}

/**
 * Removes the sign-in entry the page-load address named, on a host that wires
 * no trigger: the production build, whose `wireDevSignInTriggers` has no auth
 * config to wire the triggers with. The address is read here, before the
 * first render, the same reading `wireSignInTriggers` does - the router clears
 * every entry from the address once the first routed domain starts. The
 * removal itself is the one `removeSignInEntryAtStart` performs, once the
 * bootstrap has settled and the modal slot has attached: an address that names
 * the sign-in entry mounts a modal whose only closer is the `sign_in` of a
 * chain nothing sends on such a host, so the entry is taken out instead. No
 * trigger is wired: no 401 hook runs, and nothing here sets the once-guard.
 *
 * A bootstrap that fails keeps the entry, with a warning: the domains the
 * unmount chain names may not exist, so the unmount could not be delivered
 * (the start-up check of a wired host keeps it for the same reason).
 */
export function removeSignInEntryAtPageLoad(app: FrontXApp): void {
  const addressNamedSignIn = addressSignInEntry() !== undefined;
  if (!addressNamedSignIn) return;
  void (async () => {
    try {
      await bootstrapSettled();
      await removeSignInEntryAtStart(app);
    } catch (error) {
      console.warn(
        '[signInTriggers] the bootstrap failed, so the sign-in entry the page-load address named stayed',
        error,
      );
    }
  })();
}

/**
 * The 401 trigger: a request that failed with 401 opens the sign-in modal,
 * unless the transport can still recover the request. The hook runs as an
 * informational call before the transport plugin's refresh decision (`auth.ts`
 * calls it "before retry decisions"), so a 401 here does not yet mean the
 * session is gone. When the provider carries a `refresh`, the trigger lets the
 * transport's refresh flight for that 401 settle and reads what it resolved
 * to, and the flight's own result decides: the runtime reports the flight's
 * outcome, so a flight that resolved no session is signed out and the chain
 * goes out, while a flight that resolved a session is signed in and the
 * question stays closed for the 401 the flight ran for: the transport
 * reissues that request with what the flight resolved. The 401 the retried
 * request meets afterwards is not answered by the flight - the transport
 * refreshes nothing for a retry (`auth.ts` exits before the refresh decision
 * when the retry count is not 0), so the hook fires for it with no flight
 * behind it, and `app.auth.checkAuth()` answers it: the provider is the
 * authority, and one that holds a session (a step-up challenge, RFC 9470, or
 * a server that ended the session while the token is still valid) says
 * authenticated, so no modal opens over it, while a signed-out answer sends
 * the chain. `app.auth.checkAuth()` is asked only when no
 * flight ran, when the flight rejected and left no result to read, or when
 * the provider carries no refresh at all: a
 * provider that keeps the old token would answer from it, and a check started
 * at hook time would run alongside the flight and answer from the state the
 * flight is about to replace. A check that rejects or never answers sends
 * nothing, since it says as little about the session as the hook does, and
 * says so with the warning the start-up path gives. Whatever the decision, the
 * confirmation is not held while the send waits for the bootstrap
 * and the modal slot, so a late 401 of a newer session is confirmed on its
 * own and its snapshot overwrites the one the waiting send will judge
 * against. That comparison the send runs (`sendSignInChainOnce`) uses the
 * same shape the chain remembers a rejected session in (`credentialSnapshot`,
 * `signIn.ts`), and its measure is credentials, not
 * the count of announced session starts (`AuthEvents.LoggedIn`): the session
 * tracker emits that event for an unknown identity too - a rejected refresh,
 * an unchecked one, a `getIdentity()` that fails - so a rejected flight would
 * be counted as a session start while `checkAuth` says signed out, exactly
 * the case the fallback exists for. Without a refresh there is nothing on the
 * transport that could recover the request, but the 401 still says nothing
 * about the session by itself, so the same confirmation asks `checkAuth()`:
 * a signed-out answer sends the chain, a signed-in one closes the question,
 * and a check that cannot answer says nothing and sends nothing. A host
 * without an auth runtime has nothing to ask, so the trigger is confirmed at
 * once and the chain goes out without a check - through
 * the same `confirmSignIn` hand-off and the same guard. Once the guard is
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

  // The transport of every app of the realm, the microfrontends that join
  // with `auth()` included, starts each 401 refresh flight by calling the
  // provider's `refresh` (`auth.ts` reads it, at error time, off the provider
  // the transport is bound for, which is this provider while it is in use),
  // so a wrap installed here, after the app is built, is what every later
  // flight goes through. The wrap only observes: the call and its
  // result reach the provider untouched, the flight in progress is
  // remembered so the 401 confirmation below can wait it out instead of
  // racing it, and what the flight resolved to is kept with it, so the
  // confirmation reads the runtime's own answer instead of asking the
  // provider again. The auth runtime's own `refresh` is wrapped the same
  // way, for code that calls `app.auth.refresh()` itself; it calls the
  // original the auth plugin captured at build time, so no flight is seen
  // twice. The `refresh` and `onTransportError` wraps sit on the provider
  // this app passed, so a provider another app passes later, replacing it,
  // carries neither; the `app.auth.refresh` wrap sits on the realm's shared
  // runtime, so it stays across a replacement and sees the
  // `app.auth.refresh()` calls of every app.
  type TrackedFlight = {
    promise: Promise<unknown>;
    /** Set once the flight settles: the session it resolved to, or its failure. */
    outcome: { session: unknown } | { failed: true } | undefined;
  };
  let refreshFlight: TrackedFlight | null = null;
  const observeFlights = <T>(refresh: (ctx?: AuthContext) => Promise<T>) =>
    (ctx?: AuthContext): Promise<T> => {
      const flight = refresh(ctx);
      const tracked: TrackedFlight = { promise: flight, outcome: undefined };
      refreshFlight = tracked;
      // The outcome is recorded by the handler attached first, so a caller
      // that awaits the promise reads it after it is set.
      void flight.then(
        (session) => {
          tracked.outcome = { session };
          if (refreshFlight === tracked) refreshFlight = null;
        },
        () => {
          tracked.outcome = { failed: true };
          if (refreshFlight === tracked) refreshFlight = null;
        },
      );
      return flight;
    };
  const refresh = provider.refresh?.bind(provider);
  if (refresh) provider.refresh = observeFlights(refresh);
  const runtimeRefresh = app.auth?.refresh;
  if (app.auth && runtimeRefresh) app.auth.refresh = observeFlights(runtimeRefresh);

  /**
   * The credentials of the runtime's current session, read through the one
   * helper beside `credentialSnapshot` (`signIn.ts`): `null` when the runtime
   * holds no session, `undefined` when the read failed or there is no runtime
   * to read. The helper is total, so the promise never rejects and no path
   * that takes a snapshot needs a catch of its own - not even the ones that
   * never reach `confirmSignIn`, the only place a catch used to be attached.
   * A provider that builds a fresh object on every read is compared
   * by credentials, never by object identity.
   */
  const readSessionSnapshot = (): Promise<string | null | undefined> =>
    readSessionCredentials(app.auth);

  // One confirmation at a time, whichever branch the hook takes: the check
  // can travel the same REST transport the 401 came from, so its own 401
  // fires this hook again while the first check is still out, and a burst of
  // failing requests fires the hook once per request; the confirmation
  // already running answers them all, and no second check starts behind it.
  // The confirmation glues the 401s of one burst of one flight and ends when
  // it hands its snapshot to the send: the send's own waits for the bootstrap
  // and the modal slot hold no confirmation, so a later 401 of a newer
  // session is confirmed on its own and overwrites the snapshot.
  let confirmation: Promise<void> | null = null;

  /**
   * Reads the settled refresh flight's outcome, and asks the runtime
   * (`checkAuth`) when no flight ran, when the flight rejected, or when the
   * provider carries no refresh and no flight could run at all: a flight
   * that resolved anything (a session or null) is the runtime's own answer.
   * When the answer is signed out, the confirmation ends by handing the
   * snapshot the hook took to the send (`confirmSignIn`); it is not held
   * while the send waits.
   */
  const confirmSessionGone = (sessionAt401: Promise<string | null | undefined>): void => {
    if (confirmation) return;
    const settled = (): void => {
      confirmation = null;
    };
    confirmation = (async () => {
      // One tick before the flight is read: the transport starts or joins its
      // flight in the same tick the hook returns in, before its first await,
      // so the flight the 401 will get is tracked by then. No flight tracked
      // means the transport did not refresh (its budget is spent, or this 401
      // rode a retried request), and there is no flight result to read.
      await Promise.resolve();
      const flight = refreshFlight;
      if (flight) {
        await flight.promise.catch(() => undefined);
        const outcome = flight.outcome;
        if (outcome && 'session' in outcome) {
          // The flight's own result is the runtime's answer, so the provider
          // is not asked again: a provider that keeps the old token would
          // answer from it. A session means signed in for the 401 the flight
          // ran for - the retried request goes out with what the flight
          // resolved, and its own 401 arrives with no flight behind it and
          // is asked of `checkAuth` below; no session is signed out.
          if (outcome.session) return;
          confirmSignIn(app, sessionAt401);
          return;
        }
        // The flight rejected, so it left no result to read: the state the
        // last settled flight left is the one to ask about, as when no
        // flight ran at all.
      }
      const result = await app.auth?.checkAuth().catch((error: unknown) => {
        console.warn(
          '[signInTriggers] the 401 session check did not answer; no sign-in chain sent',
          error,
        );
        return undefined;
      });
      if (!result) return;
      if (!result.authenticated) confirmSignIn(app, sessionAt401);
    })();
    void confirmation.then(settled, settled);
  };

  provider.onTransportError = (event: FrameworkTransportErrorEvent): void => {
    previous?.(event);
    if (event.status !== 401) return;
    // A 401 from an origin outside the app's own and both origin lists says
    // nothing about this session: no confirmation, no `checkAuth()`, no
    // snapshot. One from an origin listed for the other session kind still
    // comes through and is confirmed like any other 401, below.
    if (event.credentialed === false) return;
    // The guard is up: the chain cannot go out again, so there is nothing
    // left to confirm and nothing to send.
    if (chainSent) return;
    // The hook runs before the transport's refresh-and-retry, so the session
    // is confirmed before the modal opens: on a host with an auth runtime the
    // confirmation reads what the transport's refresh flight resolved, and
    // asks `checkAuth()` when no flight ran or the flight rejected. The two
    // branches below split on the auth runtime, not on the refresh: a
    // provider that carries a refresh but built no runtime asks nothing, and
    // a refresh-less provider on a runtime asks the same check as a
    // refreshing one.
    // The 401s a confirmation already running answers are dropped whole, so
    // they read no snapshot of their own: the session read starts only for
    // the 401 that will actually hand one over, and both branches keep this
    // one guard. The guard dedupes within one tick only: 401s of the same
    // burst that land in later ticks each take their own snapshot, on
    // purpose - the latest-wins overwrite of the one snapshot variable needs
    // every confirmed 401 to hand its own snapshot over.
    if (confirmation) return;
    if (app.auth) {
      // The credentials the 401 was against, read as the hook runs: whatever
      // the flight or a parallel sign-in does to the session afterwards, the
      // comparison before the dialog opens has this to compare against.
      // With a refresh the confirmation waits the flight out and reads what
      // it resolved to. Without one, nothing on the transport could recover
      // the request, but the 401 still says nothing about the session by
      // itself - a step-up challenge (RFC 9470) or a gateway 401 during an
      // outage lands on a live session, and a cookie provider has no refresh
      // to wait out - so the same confirmation asks `checkAuth()`: a
      // signed-out answer sends the chain, a signed-in one closes the
      // question, and a check that cannot answer says nothing and sends
      // nothing. The confirmation running is the guard the 401s of one burst
      // share, its own 401s included: they are dropped whole, and a 401 that
      // lands after it settled takes its own snapshot, which the latest-wins
      // overwrite needs.
      confirmSessionGone(readSessionSnapshot());
      return;
    }
    // No auth runtime to ask: nothing could answer for the session, whatever
    // refresh the provider itself carries, so the trigger is confirmed at
    // once and hands its snapshot to the send. The confirmation ends there -
    // it does not hold across the send's own waits for the bootstrap and the
    // modal slot - and the guard above dedupes within one tick only: a 401 of
    // the same burst that lands in a later tick takes its own snapshot, which
    // the latest-wins overwrite needs.
    const sessionAt401 = readSessionSnapshot();
    const settled = (): void => {
      confirmation = null;
    };
    confirmation = Promise.resolve(confirmSignIn(app, sessionAt401));
    void confirmation.then(settled, settled);
  };
  void checkSessionAtStart(app, addressNamedSignIn);
}
