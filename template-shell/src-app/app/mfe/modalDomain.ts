/**
 * The popup domain's implementation, as this shell presents it: a modal
 * extension domain.
 *
 * The framework ships the `popupDomain` declaration (route `popup`, actions
 * `load_ext`, `mount_ext`, `unmount_ext`); this shell implements it with the
 * `OptionalMountStrategy`, the zero-or-one strategy the runtime names for
 * popup-style domains: `mount_ext` opens a modal (displacing the one before
 * it), `unmount_ext` closes it. `MfeScreenContainer` renders the domain's
 * slot inside the dialog layer and hands `registerModalDomain` to the
 * bootstrap it starts, so the domain and its types are registered before the
 * manifests are walked. The declaration's `extensionsTypeId` pins the
 * domain's extensions to the derived modal extension type
 * (`extension_modal.v1.json`), which requires the presentation properties the
 * dialog layer renders with. A shell that renders no modal layer has no
 * popup domain.
 */

import {
  ActionHandler,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  AuthEvents,
  OptionalMountStrategy,
  eventBus,
  popupDomain,
} from '@gears-frontx/react';
import type {
  ActionPayload,
  DomainContext,
  Extension,
  ExtensionPresentation,
  FrontXApp,
  MountStrategy,
} from '@gears-frontx/react';
import { extensionModalSchema } from '@gears-frontx/frontx-template-shell';
import { clearAutomaticReload } from './automaticReload';
import {
  buildSignInUnmountChain,
  isRejectedSession,
  SIGN_IN_ACTION_TIMEOUT_MS,
  SIGN_IN_EXTENSION_ID,
} from '@/app/auth/signIn';
import { CHROME_MODAL_ACTION_SCHEMAS, CHROME_SIGN_IN } from './chrome-actions';
import { createElementTrackingHooks } from './createElementTrackingHooks';

/**
 * The derived Extension type the modal domain's extensions must use: the id
 * the schema `extension_modal.v1.json` is registered under (its `$id` without
 * the `gts://` scheme), the same relation the screen domain's declaration has
 * to the framework's `FRONTX_SCREEN_EXTENSION_TYPE`.
 */
export const MODAL_EXTENSION_TYPE_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.popup.v1~';

/** How the dialog layer presents a modal. */
export type ModalSize = 'full' | 'medium';

/**
 * The presentation properties of a modal extension. `size` picks the dialog
 * layer's layout; `cancelable` says whether the user can close the modal from
 * the UI (Escape, close button) - false leaves closing to the host.
 */
export interface ModalExtensionPresentation extends ExtensionPresentation {
  size: ModalSize;
  cancelable: boolean;
}

/** A modal extension as a manifest declares it. */
export interface ModalExtension extends Extension {
  route: string;
  presentation: ModalExtensionPresentation;
}

/** A modal extension as the registry hands it out: without its `route`, which only the injected router receives. */
export type RegistryModalExtension = Omit<ModalExtension, 'route'>;

/**
 * The modal extension the shell's own popup domain implementation has
 * mounted. `ModalDomainImpl` sets and clears it from the modal domain's
 * container hooks; the dialog layer in `MfeScreenContainer` reads it.
 */
type Listener = () => void;

let current: string | undefined;
const listeners = new Set<Listener>();

export const modalState = {
  getSnapshot(): string | undefined {
    return current;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(id: string | undefined): void {
    current = id;
    for (const listener of [...listeners]) listener();
  },
};

class ModalDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: OptionalMountStrategy;

  constructor(
    ctx: DomainContext,
    private readonly app: FrontXApp,
  ) {
    super();
    // Zero-or-one: `mount_ext` opens the modal named by the payload's
    // `subject`, displacing the one before it, and `unmount_ext` closes it.
    // The runtime's `reflect` commands to the router of
    // `@gears-frontx/routing`, which the framework injects into the registry,
    // write this occupancy into the URL, so an open modal is addressable and
    // a history step that leaves it sends the `unmount_ext` the router
    // resolves through this domain.
    this.strategy = new OptionalMountStrategy(ctx.mounter, createElementTrackingHooks(modalState));
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        await this.strategy.mount(p as ActionPayload);
      }),
    );
    ctx.registerHandler(
      FRONTX_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        await this.strategy.unmount(p as ActionPayload);
      }),
    );
    // The sign-in flow's wait: the chain that opened the sign-in modal holds
    // here until a session exists, then closes the modal, and whatever the
    // chain names next runs (the reload the page needs to repeat the requests
    // that failed without the session).
    ctx.registerHandler(
      CHROME_SIGN_IN,
      ActionHandler.fromFunction(async () => {
        await this.waitForSessionThenCloseSignIn();
      }),
    );
  }

  /**
   * Resolves once a session exists, then unmounts the sign-in extension.
   *
   * The session is read on the auth runtime the auth plugin provides
   * (`app.auth`); the change is awaited on the event the plugin emits when a
   * session begins: `auth/loggedIn` on the event bus. That one signal covers
   * every way the sign-in can sign in - the runtime's `login` wrapper emits it
   * itself, and a sign-in that goes through the provider directly is followed
   * by the plugin through its `provider.subscribe` subscription, which emits
   * the same event. `app.auth.subscribe` would only hear the provider's own
   * stream and exists on runtimes whose provider implements it, so it is the
   * narrower of the two and not the one waited on.
   *
   * The subscription goes up before the session is read, so a sign-in that
   * lands between the read and the subscription cannot fall through the gap.
   * A session that already exists resolves at once.
   *
   * The event is the wake-up, not the answer: the tracker emits it for more
   * than a finished sign-in (a refresh that resolves the rejected session
   * after signed out, and a refresh that rejects while signed in, which
   * clears for an unknown identity as a cache-scope signal), so every
   * announcement is followed by one fresh read of the session, and only a
   * session that exists and is not the rejected one ends the wait. One read
   * per announcement, no polling; every read is raced against the bound
   * below, so no read can close the modal or drop the stamp after the bound
   * has won, and a read that fails after an announcement counts as "no
   * session" - the wait goes on for the next announcement or the bound
   * instead of failing the action. The first read is announced by nothing,
   * so a failure of that one still fails the action.
   *
   * Without the auth plugin the action fails at once: there is no runtime that
   * could report a session, so waiting would only burn the sender's timeout.
   * A modal that is already gone is not an error - the dispatched `unmount_ext`
   * is a no-op for an unmounted subject - which is the accepted Back-button
   * gap with a session: the action resolves, the unmount does nothing, and the
   * chain reloads the page. Without a session that same gap ends when the
   * sender's timeout expires and the chain's fallback reloads the page. The
   * wait holds a bound of its own, of the same length as that timeout
   * (`SIGN_IN_ACTION_TIMEOUT_MS`, the chain of `buildSignInChain`): once it is
   * out the mediator has moved the chain to its fallback and this handler no
   * longer owns the flow, so it gives up instead of staying on the
   * `auth/loggedIn` subscription and closing the modal - or dropping the
   * reload guard's stamp below - for a session that lands afterwards, which
   * would clear the loop guard on a path the chain no longer runs.
   */
  private async waitForSessionThenCloseSignIn(): Promise<void> {
    const auth = this.app.auth;
    if (!auth) {
      throw new Error(
        '[MFE Bootstrap] sign_in needs the auth plugin on this host: it waits for the session ' +
          'the sign-in extension creates through app.auth, and no auth runtime exists to report one.',
      );
    }
    let giveUp!: () => void;
    const bound = new Promise<void>((resolve) => {
      giveUp = resolve;
    });
    const boundTimer = setTimeout(giveUp, SIGN_IN_ACTION_TIMEOUT_MS);
    // One waiter at a time, registered before each session read so an
    // announcement that lands beside the read cannot fall through the gap:
    // the subscription is up before the first read, and the next waiter is
    // registered synchronously after each round.
    let wake: (() => void) | null = null;
    const subscription = eventBus.on(AuthEvents.LoggedIn, () => wake?.());
    const nextAnnouncement = (): Promise<void> =>
      new Promise<void>((resolve) => {
        wake = resolve;
      });
    // Whether the read about to run follows an announcement. The first read
    // does not: nothing has announced a session start yet, so a failure of
    // that read is the action's own failure. Every later read follows one.
    let announced = false;
    try {
      for (;;) {
        const announcement = nextAnnouncement();
        // The session the runtime holds decides, not the announcement
        // alone: the tracker emits `auth/loggedIn` for more than a finished
        // sign-in. A refresh that resolves a session after the session went
        // signed out emits it too, and the session it resolves can be the
        // rejected one (`invalidateRejectedSession`), and a refresh that
        // rejects while the tracker still says signed in clears for an
        // unknown identity and emits it as a cache-scope signal with no
        // session behind it at all (`clearForUnknownIdentity`). Taking any
        // announcement for a sign-in would close the modal with no sign-in
        // behind it and drop the reload guard's stamp below. So each
        // announcement is followed by one fresh read, and only a session
        // that is neither missing nor the rejected one ends the wait.
        //
        // The read is raced against the bound like the announcement is: a
        // read that answers after the bound has won must close nothing and
        // clear no stamp, the mediator having moved the chain on already.
        // A re-read that fails after an announcement is no answer either -
        // the provider may be mid-refresh, or unable to answer for a
        // moment - so it counts as "no session" and the wait goes on
        // instead of failing the action the mediator would then fall back
        // from. The first read is announced by nothing, so its failure
        // stays the action's own failure.
        const read = auth.getSession().then(
          (session) => ({ session }),
          (error: unknown) => {
            if (!announced) throw error;
            return { session: null };
          },
        );
        const settled = await Promise.race([read, bound.then(() => null)]);
        if (!settled) return;
        announced = true;
        if (settled.session && !isRejectedSession(settled.session)) break;
        const outcome = await Promise.race([
          announcement.then(() => 'announced' as const),
          bound.then(() => 'expired' as const),
        ]);
        if (outcome === 'expired') return;
      }
    } finally {
      clearTimeout(boundTimer);
      subscription.unsubscribe();
    }
    // A new session exists, so the chain reached its goal and the reload its tail
    // asks for is a reload the page needs, not a loop step: drop the reload
    // guard's stamp, or a failure reload moments earlier would block the
    // reload a finished sign-in should be followed by (`automaticReload.ts`).
    clearAutomaticReload();
    await this.unmountSignInExtension();
  }

  /**
   * Unmounts the sign-in extension through the registry, so the runtime writes
   * the address without the popup entry.
   *
   * The unmount goes out as the `unmount_ext` action of `buildSignInUnmountChain`
   * (`signIn.ts`) instead of as a direct strategy call, because the URL write
   * lives in the runtime's wrappers around a domain's `mount_ext` and
   * `unmount_ext` handlers (mfes `DomainReflectCommands`): a strategy called
   * directly reaches none of them, so the modal closes while the address keeps
   * `?popup=sign-in` - and the `refresh_page` the chain follows with reloads
   * straight back into the modal, which the live walk of round 3 (issue 112)
   * fell into. Dispatched, the wrapper's acceptance command writes the mount
   * set without the sign-in extension into the address with the payload's
   * `replace` intent, synchronously within the dispatch, and its settle
   * command writes the same occupancy again once the unmount has settled.
   *
   * `executeActionsChain` returns nothing awaitable, so the action resolves on
   * the shell's own modal state: the wait ends when the state stops naming the
   * sign-in extension - the domain's container hooks clear it as the unmount
   * releases the extension, and the acceptance command has already written the
   * address by then. A modal that is already gone resolves at once, and so
   * does one another modal has displaced: the zero-or-one strategy holds one
   * id at a time, the sign-in `unmount_ext` is a no-op for a displaced
   * subject, and waiting for an empty store would hold the action until the
   * sender's timeout ran out over a modal that is not this one. A host without
   * a registry cannot reach here: the domain is only registered on an app that
   * had one, and an unmount that skipped the runtime's URL write would leave
   * the popup entry in the address, so the missing registry is a thrown error
   * instead of a silent fallback.
   */
  private async unmountSignInExtension(): Promise<void> {
    const registry = this.app.mfeRegistry;
    if (!registry) {
      throw new Error(
        '[MFE Bootstrap] sign_in unmount needs the mfeRegistry: without it the unmount would skip the runtime URL write and the address would keep the popup entry.',
      );
    }
    registry.executeActionsChain(buildSignInUnmountChain());
    if (modalState.getSnapshot() !== SIGN_IN_EXTENSION_ID) return;
    await new Promise<void>((resolve) => {
      // The same bound the session wait holds: once it is out the mediator has
      // moved the chain to its fallback and this handler no longer owns the
      // flow, so give up instead of holding the action - and the subscription
      // below - open for a modal state that will never change.
      const boundTimer = setTimeout(finish, SIGN_IN_ACTION_TIMEOUT_MS);
      const unsubscribe = modalState.subscribe(() => {
        if (modalState.getSnapshot() === SIGN_IN_EXTENSION_ID) return;
        finish();
      });
      function finish(): void {
        clearTimeout(boundTimer);
        unsubscribe();
        resolve();
      }
    });
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ModalDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly app: FrontXApp) {
    super();
  }
  build(ctx: DomainContext): ModalDomainImpl {
    return new ModalDomainImpl(ctx, this.app);
  }
}

/**
 * Registers the popup domain, as this shell presents it, and the types its
 * actions name, on `app`'s registry.
 *
 * The types go first: the registry validates the declaration against them,
 * and the derived type must exist before an extension of it is admitted. The
 * shipped `popupDomain` is spread rather than edited: the only properties this
 * shell adds are `extensionsTypeId`, naming the derived type above, and the
 * `sign_in` chrome action its own handler answers - the `popup` route, the
 * `load_ext`, `mount_ext` and `unmount_ext` actions and the shared theme and
 * language properties are the declaration's own.
 *
 * @param app - FrontX application instance whose registry hosts the domain
 */
export function registerModalDomain(app: FrontXApp): void {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }
  registry.typeSystem.registerSchema(extensionModalSchema);
  for (const schema of CHROME_MODAL_ACTION_SCHEMAS) {
    registry.typeSystem.registerSchema(schema);
  }
  registry.registerDomain(
    {
      ...popupDomain,
      extensionsTypeId: MODAL_EXTENSION_TYPE_ID,
      actions: [...popupDomain.actions, CHROME_SIGN_IN],
    },
    new ModalDomainFactory(app),
  );
}
