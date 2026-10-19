/**
 * The screen domain's implementation.
 *
 * The screen domain exists because this shell implements it: `MfeScreenContainer`
 * renders its slot and hands `registerScreenDomain` to the bootstrap it starts,
 * and the bootstrap runs it before it walks the manifests. The registration
 * puts the domain's types on the type system itself (the screen extension type
 * the declaration names in `extensionsTypeId`, and the two chrome actions it
 * opts into) and then registers the domain with the implementation below. A
 * project that renders no screen container has no screen domain.
 */

import {
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ExclusiveMountStrategy,
  ActionHandler,
  FRONTX_ACTION_MOUNT_EXT,
  screenDomain,
} from '@gears-frontx/react';
import type {
  FrontXApp,
  ContainerHooks,
  DomainContext,
  ActionPayload,
  MountStrategy,
} from '@gears-frontx/react';
import { extensionScreenSchema } from '@gears-frontx/frontx-template-shell';
import {
  CHROME_ACTION_SCHEMAS,
  CHROME_SET_MENU_COLLAPSED,
  CHROME_SET_THEME,
} from './chrome-actions';
import { readHistoryIntent, screenLoadFailure } from './screenLoadFailure';
import { screenState } from './screenState';

/** The screen domain's hooks: the shell's mounted-screen state follows the container of the screen the strategy holds. */
class ScreenContainerHooks implements ContainerHooks {
  private readonly elements = new Map<string, HTMLElement>();

  create(extensionId: string): Element {
    const el = document.createElement('div');
    el.dataset.extensionId = extensionId;
    el.style.height = '100%';
    this.elements.set(extensionId, el);
    screenState.set(extensionId);
    return el;
  }

  destroy(extensionId: string, container?: Element): void {
    if (!container || this.elements.get(extensionId) === container) {
      this.elements.delete(extensionId);
    }
    if (screenState.getSnapshot() === extensionId) screenState.set(undefined);
  }
}

// The two readers below state, to TypeScript, an invariant the type system
// already enforces at runtime: `chrome-actions.ts` closes each chrome payload
// around a single required field of a declared type, and the mediator validates
// an action against that schema before it resolves any handler for it. So a
// handler never sees a payload missing its field, and neither reader is a
// refusal path a caller can trigger - reaching a throw means the schema and the
// handler disagree about the payload, which is a defect in one of the two.

function readThemeId(payload: Record<string, unknown> | undefined): string {
  const themeId = payload?.themeId;
  if (typeof themeId !== 'string') {
    throw new Error(
      '[MFE Bootstrap] set_theme payload has no string themeId; the action schema should have refused this action before it reached the handler',
    );
  }
  return themeId;
}

function readCollapsed(payload: Record<string, unknown> | undefined): boolean {
  const collapsed = payload?.collapsed;
  if (typeof collapsed !== 'boolean') {
    throw new Error(
      '[MFE Bootstrap] set_menu_collapsed payload has no boolean collapsed; the action schema should have refused this action before it reached the handler',
    );
  }
  return collapsed;
}

class ScreenDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ExclusiveMountStrategy;
  private latestMount = 0;

  constructor(
    ctx: DomainContext,
    hooks: ContainerHooks,
    app: FrontXApp,
  ) {
    super();
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, hooks);
    // The runtime's `reflect` commands to the router of
    // `@gears-frontx/routing`, which the framework injects into the registry,
    // write this mount into the URL - no domain-implementation call is needed
    // for it. An Exclusive domain
    // declares and registers no `unmount_ext`: a screen leaves through a
    // replacing `mount_ext`.
    // A new mount drops the report of the one before it; a failed mount is
    // reported for the screen container's error state and still fails the
    // action. Only the latest mount, started in the current visit, reports, so
    // a mount failing late never shows its error over a newer screen or after a
    // history step left its address.
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        const mount = ++this.latestMount;
        const visit = screenLoadFailure.visit();
        screenLoadFailure.clear();
        try {
          await this.strategy.mount(p as ActionPayload);
        } catch (error) {
          const subject = p?.subject;
          if (mount === this.latestMount && typeof subject === 'string') {
            screenLoadFailure.report(subject, readHistoryIntent(p), visit);
          }
          throw error;
        }
      }),
    );
    // The host chrome a mounted screen may drive. The one thing neither the
    // action schema nor the domain declaration can decide is whether THIS host
    // runs the plugin the action needs - `themes` and `layout` are both opt-in
    // - so each handler resolves rather than throws when it does not: chrome is
    // decoration around a screen, and a request the shell cannot honour should
    // leave the screen running instead of failing its chain.
    ctx.registerHandler(
      CHROME_SET_THEME,
      ActionHandler.fromFunction((_t, p) => {
        if (typeof app.actions.changeTheme !== 'function') {
          console.warn('[MFE Bootstrap] set_theme ignored: no themes plugin on this host');
        } else {
          app.actions.changeTheme({ themeId: readThemeId(p) });
        }
        return Promise.resolve();
      }),
    );
    ctx.registerHandler(
      CHROME_SET_MENU_COLLAPSED,
      ActionHandler.fromFunction((_t, p) => {
        if (typeof app.actions.toggleMenuCollapsed !== 'function') {
          console.warn('[MFE Bootstrap] set_menu_collapsed ignored: no layout plugin on this host');
        } else {
          app.actions.toggleMenuCollapsed({ collapsed: readCollapsed(p) });
        }
        return Promise.resolve();
      }),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ScreenDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly app: FrontXApp) { super(); }
  build(ctx: DomainContext): ScreenDomainImpl {
    return new ScreenDomainImpl(ctx, new ScreenContainerHooks(), this.app);
  }
}

/**
 * Registers the screen domain and the types it names on `app`'s registry.
 *
 * The types go first: the registry validates the declaration against them,
 * and an action carrying a chrome type can be dispatched as soon as the
 * domain is registered. The shipped `screenDomain` is spread rather than
 * edited: this shell opts itself into the two chrome actions its handlers
 * answer, and the declaration's `extensionsActions` stays untouched, since
 * listing them there would make them mandatory for every screen extension.
 *
 * @param app - FrontX application instance whose registry hosts the domain
 */
export function registerScreenDomain(app: FrontXApp): void {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }
  registry.typeSystem.registerSchema(extensionScreenSchema);
  for (const schema of CHROME_ACTION_SCHEMAS) {
    registry.typeSystem.registerSchema(schema);
  }
  registry.registerDomain(
    { ...screenDomain, actions: [...screenDomain.actions, CHROME_SET_THEME, CHROME_SET_MENU_COLLAPSED] },
    new ScreenDomainFactory(app),
  );
}
