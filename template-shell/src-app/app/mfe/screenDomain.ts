/**
 * The screen domain's implementation.
 *
 * The screen domain exists because this shell implements it: `MfeScreenContainer`
 * renders its slot and hands `registerScreenDomain` to the bootstrap it starts,
 * and the bootstrap runs it before it walks the manifests. The registration
 * puts the domain's types on the type system itself (the screen extension type
 * the declaration names in `extensionsTypeId`, and the chrome actions it
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
import { extensionScreenSchema, languageCodeSchema } from '@gears-frontx/frontx-template-shell';
import { claimAutomaticReload } from './automaticReload';
import { isShellLanguage } from '@/app/i18n/shellLanguages';
import {
  CHROME_ACTION_SCHEMAS,
  CHROME_REFRESH_PAGE,
  CHROME_SET_LANGUAGE,
  CHROME_SET_MENU_COLLAPSED,
  CHROME_SET_THEME,
} from './chrome-actions';
import { createElementTrackingHooks } from './createElementTrackingHooks';
import { reloadPage } from './pageReload';
import { readHistoryIntent, screenLoadFailure } from './screenLoadFailure';
import { screenState } from './screenState';

// The readers below state, to TypeScript, an invariant the type system
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

function readLanguage(payload: Record<string, unknown> | undefined): string {
  const language = payload?.language;
  if (typeof language !== 'string') {
    throw new Error(
      '[MFE Bootstrap] set_language payload has no string language; the action schema should have refused this action before it reached the handler',
    );
  }
  return language;
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
    // runs the plugin the action needs - `themes`, `layout` and `i18n` are all
    // opt-in - so each handler resolves rather than throws when it does not:
    // chrome is decoration around a screen, and a request the shell cannot
    // honour should leave the screen running instead of failing its chain.
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
    ctx.registerHandler(
      CHROME_SET_LANGUAGE,
      ActionHandler.fromFunction((_t, p) => {
        if (typeof app.actions.setLanguage !== 'function') {
          console.warn('[MFE Bootstrap] set_language ignored: no i18n plugin on this host');
        } else {
          // The action schema only checks the code against the SDK's language
          // list, which is wider than what this shell carries words for.
          // Storage, profile and the header control all go through
          // `isShellLanguage`, and this handler does too: a code the shell
          // cannot speak is ignored with a warning instead of switching to a
          // language that has no words and no header entry.
          const language = readLanguage(p);
          if (!isShellLanguage(language)) {
            console.warn(
              `[MFE Bootstrap] set_language ignored: ${language} is not a language this shell offers`,
            );
          } else {
            app.actions.setLanguage({ language });
          }
        }
        return Promise.resolve();
      }),
    );
    // The reload the tail of the sign-in chain asks for (and the fallback of
    // every stage of it): the same page, reloaded, so the requests that ran
    // without a session run again. Unlike the chrome decoration above, this
    // one has no plugin to be missing - it is the browser's own reload, behind
    // the `pageReload` seam a test watches - so it always resolves. It is also
    // bounded: the chain's fallbacks reload on every failure, so a failure
    // that repeats on every load would reload forever (issue 112). The guard
    // allows one automatic reload in a short window; the repeats it blocks are
    // said on the console and the page is left as it is.
    ctx.registerHandler(
      CHROME_REFRESH_PAGE,
      ActionHandler.fromFunction((_t, _p) => {
        if (claimAutomaticReload()) {
          reloadPage();
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
    return new ScreenDomainImpl(ctx, createElementTrackingHooks(screenState), this.app);
  }
}

/**
 * Registers the screen domain and the types it names on `app`'s registry.
 *
 * The types go first: the registry validates the declaration against them,
 * and an action carrying a chrome type can be dispatched as soon as the
 * domain is registered. The set is complete for the schemas it holds, the
 * language code type included, so a host without the app entry's own schema
 * block still resolves every reference the chrome actions declare.
 *
 * The shipped `screenDomain` is spread rather than edited: this shell opts
 * itself into the chrome actions its handlers answer, and the declaration's
 * `extensionsActions` stays untouched, since listing them there would make
 * them mandatory for every screen extension.
 *
 * @param app - FrontX application instance whose registry hosts the domain
 */
export function registerScreenDomain(app: FrontXApp): void {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }
  // The set_language schema validates its payload through a `$ref` to
  // `gts://gts.frontx.i18n.lang.code.v1~`, so the language code type has to be
  // on this type system before the chrome schemas: `registerSchema` resolves
  // no references, and the mediator resolves them per action at dispatch.
  registry.typeSystem.registerSchema(languageCodeSchema);
  registry.typeSystem.registerSchema(extensionScreenSchema);
  for (const schema of CHROME_ACTION_SCHEMAS) {
    registry.typeSystem.registerSchema(schema);
  }
  registry.registerDomain(
    {
      ...screenDomain,
      actions: [...screenDomain.actions, CHROME_SET_THEME, CHROME_SET_MENU_COLLAPSED, CHROME_SET_LANGUAGE, CHROME_REFRESH_PAGE],
    },
    new ScreenDomainFactory(app),
  );
}
