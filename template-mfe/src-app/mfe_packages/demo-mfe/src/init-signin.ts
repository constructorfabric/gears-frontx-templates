/**
 * Sign-in extension bootstrap.
 *
 * Builds the one FrontX app of the sign-in extension's runtime. Every
 * extension load gets its own module graph, so this runtime is not the one
 * `src/init.ts` builds for the other demo-mfe screens, and the framework lets
 * a runtime build exactly one app. That is why this entry does not import
 * `init.ts`: its app and this one would be two builds in one runtime, and the
 * second throws.
 *
 * The app carries what the sign-in screen needs and nothing else:
 * - `effects()` and `queryCacheShared()`, the same base the other screens get
 *   from `init.ts`; a mounted MFE needs the shared QueryClient.
 * - `auth()` with no provider, which joins the page's auth runtime (published
 *   by whichever app passed `auth({ provider })`, the shell in this template)
 *   and exposes it as `app.auth`. Signing in through it is signing in through
 *   the page's provider in use, so the session is one the whole page sees,
 *   and a provider another app passes later replaces it for this app too. No
 *   credentials travel over the bridge.
 *
 * The screen makes no API calls, so it registers no services and needs no
 * `mock()`.
 *
 * The join refuses in the plugin's `onRegister` when no app of the page has
 * passed a provider, and can still fail in `onInit` while it binds its
 * transport. Either throw would leave the lifecycle with nothing to mount, so
 * the join is guarded: the build always yields the app, a failed join leaves
 * `app.auth` unset, and the warning keeps the framework's own error. The
 * modal then renders its error line.
 */

import {
  auth,
  createFrontX,
  effects,
  queryCacheShared,
} from '@gears-frontx/react';
import type { AuthRuntime, FrontXApp, FrontXPlugin } from '@gears-frontx/react';

/**
 * The app with the joined runtime in its `auth` slot. The auth plugin declares
 * that slot through module augmentation in its own source file, which the
 * package's flattened declarations do not carry, so it is named here.
 */
type SignInApp = FrontXApp & { auth?: AuthRuntime };

/** Logs a failed join with the framework's own error. */
function warnJoinFailed(error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `[init-signin] joining the page's auth runtime failed, so the sign-in modal cannot sign in: ${reason}`,
    error,
  );
}

/**
 * `auth()` with its join made non-fatal. The plugin object is kept whole
 * (name, teardown); `onRegister` and `onInit` are wrapped, and a join refused
 * in `onRegister` skips `onInit`.
 */
function joinAuthGuarded(): FrontXPlugin {
  const plugin = auth();
  const joinOnRegister = plugin.onRegister;
  const joinOnInit = plugin.onInit;
  let refused = false;
  return {
    ...plugin,
    onRegister(...args) {
      try {
        joinOnRegister?.apply(plugin, args);
      } catch (error) {
        refused = true;
        warnJoinFailed(error);
      }
    },
    onInit(app) {
      if (refused) return undefined;
      try {
        return joinOnInit?.call(plugin, app);
      } catch (error) {
        warnJoinFailed(error);
        return undefined;
      }
    },
  };
}

const signInApp: SignInApp = createFrontX()
  .use(effects())
  .use(queryCacheShared())
  .use(joinAuthGuarded())
  .build();

export { signInApp };
