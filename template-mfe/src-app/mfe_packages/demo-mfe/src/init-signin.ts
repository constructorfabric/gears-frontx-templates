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
 * - `authRealmShared()`, which joins the host shell's auth runtime (published
 *   by the shell's `authRealm()`) and exposes it as `app.auth`. Signing in
 *   through it is signing in through the host's own provider, so the session
 *   is one the whole realm sees. No credentials travel over the bridge.
 *
 * The screen makes no API calls, so it registers no services and needs no
 * `mock()`.
 *
 * The join runs in the plugin's `onInit`, after the framework has already
 * marked the runtime as built. A join that throws there would leave this
 * runtime with no app and no way to build one, and the lifecycle would have
 * nothing to mount. So the join is guarded: the build always yields the app,
 * a failed join leaves `app.auth` unset, and the warning keeps the
 * framework's own error. The modal then renders its error line.
 */

import {
  authRealmShared,
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

/**
 * `authRealmShared()` with its join made non-fatal. The plugin object is kept
 * whole (name, teardown, duplicate cleanup); only `onInit` is wrapped.
 */
function joinAuthRealmGuarded(): FrontXPlugin {
  const plugin = authRealmShared();
  const joinOnInit = plugin.onInit;
  return {
    ...plugin,
    onInit(app) {
      try {
        return joinOnInit?.call(plugin, app);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[init-signin] joining the host shell's auth runtime failed, so the sign-in modal cannot sign in: ${reason}`,
          error,
        );
        return undefined;
      }
    },
  };
}

const signInApp: SignInApp = createFrontX()
  .use(effects())
  .use(queryCacheShared())
  .use(joinAuthRealmGuarded())
  .build();

export { signInApp };
