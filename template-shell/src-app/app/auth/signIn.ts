/**
 * The shell's sign-in configuration: which extension of the modal domain is
 * the sign-in one, how long the shell is willing to wait for it, and the one
 * actions chain that opens it.
 *
 * The chain is the decided flow (issue 112): `mount_ext` mounts the sign-in
 * extension in the popup domain - the modal extension domain this shell
 * implements - and `sign_in` holds the chain open until the sign-in has
 * finished, whatever `refresh_page` follows it with. The shell does not
 * perform the sign-in itself: the sign-in MFE signs in through the shared auth
 * runtime it joins (`auth()` with no provider), and no action in this chain carries
 * credentials.
 *
 * Every failure falls back to `refresh_page`, so the requests that ran without
 * a session run again once the page is back.
 */

import {
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_POPUP_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  popupDomain,
  type ActionsChain,
  type AuthRuntime,
  type AuthSession,
} from '@gears-frontx/react';
import { CHROME_REFRESH_PAGE, CHROME_SIGN_IN } from '@/app/mfe/chrome-actions';

/**
 * The token the sign-in extension carries in the address, under the popup
 * domain's route key (`?popup=...`): the router derives an extension's URL
 * name from the route its manifest declares by dropping the leading slash,
 * and the example's manifest declares the sign-in extension on `/sign-in`.
 * Kept beside `SIGN_IN_EXTENSION_ID`, the one extension id it belongs to, so
 * the pair is read together and cannot drift apart unnoticed.
 */
export const SIGN_IN_ROUTE_NAME = 'sign-in';

/**
 * The sign-in extension the template's example declares on the popup domain:
 * the modal extension type the shell's dialog layer presents (see
 * `modalDomain.ts`) followed by the example's own id, the same shape the
 * screen extensions of demo-mfe use for the screen domain.
 */
export const SIGN_IN_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.popup.v1~frontx.demo.modal.signin.v1';

/**
 * The sign_in action's own timeout, and the only place it is decided.
 *
 * The mediator bounds every action by the timeout the action declares, falling
 * back to the target domain's `defaultActionTimeout` (30 000 ms on the popup
 * domain); it imposes no upper bound of its own, so the chain can ask for
 * longer than the domain default and that is what this constant is for. Five
 * minutes: a person typing credentials into a full-screen, non-cancelable
 * modal outlasts the 30 s domain default many times over, and the action must
 * outlast the slowest legitimate sign-in while staying finite - the accepted
 * gap where the user leaves the modal without signing in (the browser Back
 * button) ends with this action timing out and the chain's fallback reloading
 * the page, instead of a chain that pends forever.
 */
export const SIGN_IN_ACTION_TIMEOUT_MS = 300_000;

/** The `refresh_page` tail, rebuilt per site so no chain object is shared. */
function refreshPageChain(): ActionsChain {
  return {
    action: { type: CHROME_REFRESH_PAGE, target: FRONTX_SCREEN_DOMAIN },
  };
}

/**
 * The sign-in entry the address carries under the popup domain's route key
 * (`?popup=...`), or `undefined` when it names none. A deep link to the
 * sign-in modal and an address an earlier sign-in left behind read the same.
 * An empty value (`?popup=`) names no entry, like `addressScreenEntry` reads
 * the screen domain's. A domain declaration without a route is not routed, so
 * no address can name an entry for one.
 *
 * @param search - The query string to read; the live address's by default.
 */
export function addressSignInEntry(search: string = window.location.search): string | undefined {
  const routeKey = popupDomain.route;
  if (!routeKey) return undefined;
  const entries = new URLSearchParams(search).getAll(routeKey);
  return entries.find((value) => value === SIGN_IN_ROUTE_NAME);
}

/**
 * The one-action chain that unmounts the sign-in extension with the `replace`
 * history intent.
 *
 * The unmount travels through the registry as an `unmount_ext` action rather
 * than as a direct strategy call, because the URL write lives in the runtime's
 * wrappers around a domain's `mount_ext` and `unmount_ext` handlers (mfes
 * `DomainReflectCommands`): the wrapper's acceptance command writes the
 * domain's projected occupancy - the mount set without the sign-in extension -
 * into the address with the verb the payload's history intent selects, and its
 * settle command writes the same occupancy again once the unmount has settled.
 * The `replace` intent makes both writes replace, so the address loses the
 * popup entry at once and gains no history step: a reload that follows a
 * finished sign-in lands on an address that names no modal.
 */
export function buildSignInUnmountChain(): ActionsChain {
  return {
    action: {
      type: FRONTX_ACTION_UNMOUNT_EXT,
      target: FRONTX_POPUP_DOMAIN,
      payload: { subject: SIGN_IN_EXTENSION_ID, history: 'replace' },
    },
  };
}

/**
 * The actions chain that opens the sign-in modal and reloads the page once the
 * sign-in has finished - or failed, or was left. Fire-and-forget for the
 * sender: the registry's `executeActionsChain` returns nothing to await.
 */
export function buildSignInChain(): ActionsChain {
  return {
    action: {
      type: FRONTX_ACTION_MOUNT_EXT,
      target: FRONTX_POPUP_DOMAIN,
      payload: { subject: SIGN_IN_EXTENSION_ID },
    },
    next: {
      action: {
        type: CHROME_SIGN_IN,
        target: FRONTX_POPUP_DOMAIN,
        timeout: SIGN_IN_ACTION_TIMEOUT_MS,
      },
      next: refreshPageChain(),
      fallback: refreshPageChain(),
    },
    fallback: refreshPageChain(),
  };
}

/**
 * The session the sign-in chain was sent against: the one a 401 or the
 * start-up check found rejected. `undefined` while no chain has invalidated a
 * session on this page.
 */
let rejectedSession: string | undefined;

/**
 * The credentials of `session` as one string that does not depend on the
 * order a provider wrote the properties in. A bearer session is its token:
 * a new expiry or refresh token on the same access token is still the same
 * credential. A cookie session is its CSRF token, the one field that tells
 * one cookie session from another, and every field when it carries none. A
 * custom session is every field with a value, serialized with sorted keys: a
 * field the provider left undefined carries no credential, so it is skipped
 * rather than serialized as `null` and read as a changed session.
 *
 * Shared by the two readers of a session snapshot: `readSessionCredentials`
 * below and `isRejectedSession`.
 */
function credentialSnapshot(session: AuthSession): string {
  if (session.kind === 'bearer') return JSON.stringify(['bearer', session.token]);
  if (session.kind === 'cookie' && session.csrfToken !== undefined) {
    return JSON.stringify(['cookie', session.csrfToken]);
  }
  const fields = session as Record<string, unknown>;
  const sorted = Object.keys(session)
    .sort()
    .filter((key) => fields[key] !== undefined)
    .map((key) => [key, fields[key]]);
  return JSON.stringify(sorted);
}

/**
 * The credentials of the runtime's current session, in the one shape
 * `credentialSnapshot` writes: the string when the runtime holds a session,
 * `null` when it holds none, and `undefined` when the read failed or there is
 * no runtime to read. The read is total: a `getSession` that throws
 * (synchronously or as a rejection) and a session `credentialSnapshot` cannot
 * serialize all come out as `undefined`, so no caller's `await` can reject and
 * no promise the helper returns needs a catch of its own. One definition of
 * the read; the two meanings of "no
 * session to compare" stay with the callers, each keeping its own fallback:
 * the 401 trigger (`signInTriggers.ts`) lets an unreadable session claim
 * nothing, so it never holds the modal back, while `invalidateRejectedSession`
 * below remembers nothing that is not a snapshot string.
 */
export async function readSessionCredentials(
  auth?: AuthRuntime,
): Promise<string | null | undefined> {
  if (!auth) return undefined;
  try {
    const session = await auth.getSession();
    // A resolved `undefined` claims nothing, where `null` is the runtime's
    // own "no session".
    if (session === undefined) return undefined;
    return session ? credentialSnapshot(session) : null;
  } catch {
    // A read that throws (synchronously or as a rejection), or a session
    // `credentialSnapshot` cannot serialize, claims nothing: it resolves
    // `undefined` instead of rejecting, so a failed read can neither reject a
    // caller's await nor jam anything behind it.
    return undefined;
  }
}

/**
 * Whether `session` carries the credentials the chain was sent against. A
 * provider that builds a fresh object on every read, in any property order,
 * is compared by those credentials, so a session it still hands out after the
 * rejection never counts as a new sign-in.
 */
export function isRejectedSession(session: AuthSession): boolean {
  return rejectedSession !== undefined && credentialSnapshot(session) === rejectedSession;
}

/**
 * Whether `credentialSnapshot` can tell one session of this shape from
 * another: the snapshot discriminates only when it is built from the one
 * credential a new session of the same shape must carry with a different
 * value. Those are the shapes `credentialSnapshot` compares by one
 * credential - a bearer session, and a cookie session that carries a CSRF
 * token - so their snapshots can tell sessions apart. Every other session
 * is serialized whole or by fields a new session of the same shape can
 * repeat, so for these shapes an equal snapshot does not prove the same
 * session.
 *
 * Read beside `isRejectedSession` by the modal domain's `sign_in`: this is
 * the fallback for a session whose snapshot still equals the rejected one.
 * The check replaces the strict comparison only then - a snapshot that
 * differs ends the wait before a check is asked - and the wait is held
 * until the one `checkAuth()` the announcement is followed with answers
 * authenticated.
 */
export function credentialSnapshotDiscriminates(session: AuthSession): boolean {
  if (session.kind === 'bearer') return true;
  return session.kind === 'cookie' && session.csrfToken !== undefined;
}

/**
 * Sets aside the credentials the chain was sent against, before the chain
 * mounts the sign-in modal: they are remembered, so a provider that keeps
 * handing them out never satisfies `sign_in` with them - the handler waits
 * for a session that is not the rejected one (`isRejectedSession`, read by
 * the modal domain's `sign_in`). The credentials arrive as the snapshot a
 * confirmed trigger took - the session the 401 was against, read at hook
 * time, or the read the start-up check took beside its signed-out answer;
 * when that snapshot could not be read (`undefined`), they are the session
 * the send's final read returned, so the stale session a provider still
 * hands out is set aside either way. The session is not ended here:
 * `logout()` goes through the provider, and a redirect provider's logout
 * navigates to the sign-in service's end-session endpoint, which would leave
 * the page before the modal mounts (during an outage, onto an error page),
 * and a logout that runs tells the user's other tabs to sign out. A rejected
 * session is not a signed-out one the runtime reported: the chain ends in
 * `refresh_page`, which resets the page and, with it, whatever still holds
 * the rejected credentials.
 */
export function invalidateRejectedSession(credentials: string | null | undefined): void {
  // `null` (the runtime held no session when the trigger read) and
  // `undefined` (the read failed, or there was no runtime) remember nothing -
  // there is no session here to set aside.
  if (typeof credentials !== 'string') return;
  rejectedSession = credentials;
}

/**
 * Runs one session read through `auth`; when it fails because the session
 * provider was replaced while it ran (the realm rejects every outcome of a
 * replaced provider, and `auth.provider` is then another object than when the
 * read started), runs it once more against the provider in use. A read that
 * throws synchronously is handled as a rejection.
 */
export function readOnProviderInUse<T>(auth: AuthRuntime, read: () => Promise<T>): Promise<T> {
  const provider = auth.provider;
  return Promise.resolve()
    .then(read)
    .catch((error: unknown) => {
      if (auth.provider === provider) throw error;
      return read();
    });
}
