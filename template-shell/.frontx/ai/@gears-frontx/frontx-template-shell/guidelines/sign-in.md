# Guideline: Sign-in Is a Modal, Not a Screen

Sign-in is not a screen and not a menu item. A screen is an item of the
navigation menu: it is listed beside the others, and a signed-in user could
open it at any time, which is not what a sign-in form is for. Sign-in is an
extension of the shell's modal extension domain, and a request for it is
answered by that extension, never by a new screen. This guideline is a
code-verified snapshot of the flow. If the files named below change, this file
must be updated to match.

Authoritative files:

- `src-app/app/mfe/modalDomain.ts` - the modal extension domain, its `sign_in`
  handler and the dialog layer the container renders
- `src-app/app/auth/signIn.ts` - the sign-in extension id, the action timeout
  and the actions chain
- `src-app/app/auth/signInTriggers.ts` - the two triggers that send the chain
- `src-app/app/auth/devMockAuthProvider.ts` - the development provider
- `src/gts/schemas/extension_modal.v1.json` - the derived modal extension type
- `src-app/app/mfe/gts/frontx.screensets/schemas/chrome/sign_in.v1.json` - the
  `sign_in` action type
- `src-app/app/mfe/gts/frontx.screensets/schemas/chrome/refresh_page.v1.json` -
  the `refresh_page` action type
- `src-app/app/mfe/pageReload.ts` - the reload the last action calls
- `src-app/app/mfe/automaticReload.ts` - the guard that bounds the chain's
  `refresh_page` repeats

## The domain and the presentation

The shell implements the framework's popup domain (`popupDomain`, route
`popup`) as its modal extension domain. `modalDomain.ts` registers it with
`OptionalMountStrategy`, so `mount_ext` opens one modal and displaces the one
before it, and `unmount_ext` closes it. The domain pins a derived extension
type, `extension_modal.v1.json`, that adds two presentation properties, both
required: `size`, `full` or `medium`, and `cancelable`, whether the user can
close the modal from the UI (Escape, the close button).

The sign-in extension declares `size` `full` and `cancelable` `false`. It
covers the viewport, and only the host unmounts it, never the person in front
of it. A project's sign-in extension keeps those two values.

No domain id is invented for this. The extension's `domain` names the popup
domain, `gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1`, and
its `id` is built on the modal extension type, the same way a screen
extension's id is built on the screen one.

## The chain the shell sends

One chain, built by `buildSignInChain()` in `src-app/app/auth/signIn.ts`:

```text
action: mount_ext   target popup, subject SIGN_IN_EXTENSION_ID
next:
  action: sign_in   target popup, timeout 300000
  next:     refresh_page   target screen
  fallback: refresh_page   target screen
fallback:
  refresh_page   target screen
```

`mount_ext` opens the sign-in extension in the modal domain. `sign_in` holds
the chain until a session that is not the rejected one exists and then
unmounts the extension. It carries no payload at all, so no credential
travels in an action. `refresh_page` reloads the page, so every request that
ran without a session runs again; it is the last step and the fallback of
every step. One guard bounds it (`src-app/app/mfe/automaticReload.ts`): one
automatic reload is allowed per 10 second window, a repeat inside it is
skipped with a console error and the page is left as it is, and a `sign_in`
clears the stamp when the session it reaches is not the rejected one, so the
success reload always happens.

`sign_in` declares its own timeout, `SIGN_IN_ACTION_TIMEOUT_MS`, five minutes.
It spans a person typing credentials, well past the popup domain's 30 second
default, and it stays finite so a sign-in that is abandoned cannot pend
forever.

The shell sends the chain on two triggers, both in
`src-app/app/auth/signInTriggers.ts`:

- at start, once the MFE bootstrap has settled and the modal slot has
  attached its root (`modalSlotAttached`), when `app.auth.checkAuth()` reports
  no session; with a session, a page-load address that names the sign-in entry
  has it removed instead (`buildSignInUnmountChain`, `replace`), with no
  reload;
- on a 401, through the provider's `onTransportError` hook, which the shell
  wraps rather than replaces, so a provider that reports its own transport
  errors keeps doing so.

One page-lifetime guard keeps it to one chain per page, and the reload resets
it. A bootstrap that fails inside a send burns the guard instead of releasing
it, because `bootstrapOnce` never resets a failed bootstrap, so a released
guard could only buy one more pass through the same rejection
(`sendSignInChainOnce`). The start-up path never sets the guard when its own
bootstrap fails, so a later 401 can still try, and that send burns the guard
in turn. When the reload guard above skips a reload, the chain guard stays up
for the rest of the page's life, so the failed chain is not sent again on the
same page either. The template wires both triggers only where it has an auth
config. A build without a provider wires no trigger, but it still sends the
unmount chain that removes a sign-in entry the page-load address named
(`removeSignInEntryAtPageLoad`).

## Who performs the sign-in

The shell does not. The auth plugin shares its runtime across the whole
realm: `authRealm()` in the shell publishes `app.auth` into the
`frontx:auth:runtime` slot on `globalThis`, and the sign-in MFE joins that
slot with `authRealmShared()`. The modal then signs in through
`app.auth.login` and sends no credentials to the shell. The shell only sees
the session appear, which is what ends the `sign_in` action. The
`auth/loggedIn` announcement is the wake-up, not the answer: the tracker
emits it for more than a finished sign-in (a refresh that resolves the
rejected session after signed out, and a refresh that rejects while signed
in, which clears for an unknown identity as a cache-scope signal), so
`sign_in` follows each announcement with one fresh read of the session and
keeps waiting until a session that is neither missing nor the rejected one
answers. The read is raced against the action's bound, so no read can close
the modal after the bound has won, and a read that fails after an
announcement counts as no session: the wait goes on for the next announcement
or the bound, instead of failing the action. The failure spends the
announcement: a real sign-in usually announces once, so the modal can then
hold until the bound, and the bound's running out leaves the chain to its
fallback reload. Whether the read ends the wait follows from the shape the
session carries: a bearer session is compared by its token, and a cookie
session that carries a CSRF token by that token. Every other shape asks the
session check instead - a cookie session without a CSRF token, with or
without an expiry, and a custom session - because no other field says that a
sign-in happened: each announcement is followed by one
`app.auth.checkAuth()`, raced against the bound like the read, and the wait
ends only when it answers authenticated; a rejected check counts as not
signed in and the wait goes on. A project's sign-in extension inherits
whichever of these shapes its session takes.

The provider decides how the sign-in happens, and there are two kinds. A
provider like the development one completes the sign-in inside `login()`
itself, with no navigation. An OIDC provider's `login()` may leave the page
on its own, or return `{ type: 'redirect', redirectUrl }`
(`AuthTransitionRedirect` in `@gears-frontx/auth`). Nothing in the template
follows a redirect result, so the extension has to: with such a provider the
sign-in extension is a "Sign in" button that calls `app.auth.login()` and
navigates to `redirectUrl` when that is the answer. The chain reaches
`sign_in` before that click: it starts as soon as the extension is mounted,
and the navigation abandons the running wait. `refresh_page` never runs on
the departing page. The return needs no template code: the provider comes
back to the address it left, which still carries `?popup=sign-in` (the
chain's `mount_ext` wrote the popup entry there), and the start-up check
removes that entry once a session exists (`checkSessionAtStart` in
`signInTriggers.ts` sends the unmount chain); with no session, it sends the
sign-in chain again. The entry is removed when the check sends no chain
either: a check that rejects, or a host wired without an auth runtime (only a
wiring without the auth plugin reaches that branch). A bootstrap that fails
is the one start that keeps the entry: the session check does not run, the
start only warns, and the removal is skipped because the domains the unmount
chain names may not exist, so the unmount could not be delivered. A
production build wires no trigger at all, and its removal happens without
one: `wireDevSignInTriggers` (`devAuth.ts`) reads the page-load address
before the first render and calls `removeSignInEntryAtPageLoad`
(`signInTriggers.ts`), which sends the same unmount chain once the bootstrap
has settled and the modal slot has attached. Nothing sets the once-guard on
these paths, so a later 401 still opens sign-in.

A provider whose sign-in service cannot be reached is not signed out:
`checkAuth()` should reject in that case. The trigger sends nothing for a
check that rejects - it warns the same way at start (`checkSessionAtStart`)
and after a 401 (`confirmSessionGone`) - so a failed start never opens a
modal whose button would send the user to the service that is down. A failed
start also removes the entry the page-load address named: the router mounts
that entry's modal, and the start-up check unmounts it once the modal slot
has attached, so it does not stay. A signed-out answer from `checkAuth()` is
what opens the modal, and the trigger asks for it after 401s as well as at
start (when no refresh flight ran, when the flight left no result to read, or
when the provider carries no refresh at all - without one nothing on the
transport could recover the request, but the 401 still says nothing about the
session by itself), so `checkAuth()` has to be safe to call repeatedly. The
same holds for `refresh()`: when the sign-in service cannot be reached it
should reject, not resolve `null`. After a 401, a refresh flight that
resolves `null` is the answer and opens the modal without asking
`checkAuth()`, while a flight that rejects leaves no answer and the trigger
asks `checkAuth()` instead (`confirmSessionGone`). On a host without a
refresh the same confirmation asks `checkAuth()` once per confirmation: a 401
that lands while a confirmation is running is dropped whole, and so is any
401 after the chain went out; only a host without an auth runtime confirms at
once, with nothing to ask.

## The development provider

`src-app/app/auth/devMockAuthProvider.ts` is development only, like mock
mode. `src-app/app/auth/devAuth.ts` holds it behind `import.meta.env.DEV`
together with the plugin list and the trigger wiring, and both entries call
that one module, so a production build carries no provider, no auth plugin
and no realm plugin, and it wires no trigger; the one thing it still does
there is remove a sign-in entry the page-load address named
(`removeSignInEntryAtPageLoad`), since the modal that entry mounts has no
`sign_in` behind it to close it. It accepts any non-empty credentials and
keeps a bearer session in `sessionStorage`, enough to walk the flow without a
backend. A project replaces it with its own `AuthProvider` in that module and
drops the `import.meta.env.DEV` condition there, which is what also turns the
triggers on in a production build: they are wired whenever an auth config
exists.

The mock REST plugin answers 200 to every request its mock map matches, and a
request no key matches passes through to the network, so in development the
signed-out start is the one way the flow is reached. A 401 in a project with
its own backend is the other.

## Known gap: the Back button

The browser Back button closes the sign-in modal. The runtime writes an open
modal's occupancy into the address, so a history step that leaves it sends the
`unmount_ext` the router resolves through the domain, and nothing tells the
screen or the shell that sent the chain. With a session the chain goes on and
reloads. Without one, the requests that failed stay failed until `sign_in`
times out and the fallback reloads the page, which starts the flow again and
reopens the modal. This corner case is accepted for now: no project fix is
expected, and none is needed for the flow itself to work.

## Files a project edits

- `src-app/app/auth/signIn.ts`: `SIGN_IN_EXTENSION_ID` becomes the id of the
  project's own sign-in extension, `SIGN_IN_ROUTE_NAME` becomes the route that
  extension's manifest declares (without the leading slash), and
  `SIGN_IN_ACTION_TIMEOUT_MS` changes when a sign-in legitimately takes longer
  than five minutes.
- the auth config: in `src-app/app/auth/devAuth.ts`, `createDevMockAuthProvider()`
  is replaced by the project's own `AuthProvider`, and the `import.meta.env.DEV`
  condition on that line goes with it, so a production build carries the
  provider and wires the triggers too. A project whose provider keeps a cookie
  session adds `frontxApi` (the cookie origins and the CSRF header name) to that
  same config object.

Both plugins read that one config. `auth(authConfig)` builds the shell's own
REST transport from it, and `authRealm({ frontxApi: authConfig.frontxApi })`
publishes the same config for every `authRealmShared()` join. The shared module
already passes it to both, so a project edits the config in one place. A project
that writes the plugins out by hand must give both of them the same
`frontxApi`: a host that passes it only to `auth()` publishes no config for the
joins, so every MFE request, the sign-in MFE's included, goes out without the
cookie credentials and CSRF header the shell's own requests carry, and nothing
reports the problem.

Refreshes are the provider's to dedupe. The realm does not dedupe them: a
join's transport forwards each 401 to the shared runtime's `refresh()`
(`trackedProvider()` in `authRealm.ts`), and the dedup that exists is per
transport plugin instance, so the concurrent 401 refreshes of one app share
one flight while two microfrontends that 401 at the same moment reach the
host provider's `refresh()` twice. A provider that keeps one token request in
flight and queues the rest makes that one request per page.

The origin lists are the host's, and they are the lists for every joined MFE,
because a join takes no options (`authRealmShared()` is parameterless): the
cookie origins and the CSRF header the host publishes beside the runtime are
what every MFE's requests carry; the host's published `frontxApi` config is
forwarded whole to every joined MFE. Today only cookie credentials are
origin-checked (`AuthRestPlugin.onRequest`); a bearer token goes to every
origin. A project passes the same `frontxApi` to BOTH `auth({ frontxApi })`
and `authRealm({ frontxApi })` on the host: a config that reaches only
`authRealm()` applies to the MFEs and not to the shell's own requests.

Everything else in this flow is the shell's and stays unedited.
