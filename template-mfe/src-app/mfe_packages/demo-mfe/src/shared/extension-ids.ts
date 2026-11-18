/**
 * Extension IDs from mfe.json
 * Centralized constants for cross-screen navigation references
 */

export const HELLOWORLD_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1';
export const PROFILE_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.profile.v1';
export const THEME_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.theme.v1';
export const UIKIT_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.uikit.v1';

/**
 * Extension ID of the example sign-in modal on the shell's popup domain, the
 * modal extension domain the shell's dialog layer presents. The shell's own
 * sign-in configuration (`template-shell/src-app/app/auth/signIn.ts`) names
 * this exact id in its `SIGN_IN_EXTENSION_ID`, because its chain mounts the
 * modal by subject; the two literals must stay in step by hand, the way a
 * screen bundle redeclares any id it cannot import from the shell app.
 */
export const SIGNIN_MODAL_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.popup.v1~frontx.demo.modal.signin.v1';

/**
 * Custom action type for requesting a profile data refresh.
 * Targeted at the Profile extension ID — routed by the mediator to its registered ActionHandler.
 */
// @cpt-FEATURE:child-bridge-action-handler:p3
export const DEMO_ACTION_REFRESH_PROFILE = 'gts.frontx.mfes.comm.action.v1~frontx.demo.action.refresh_profile.v1~';

/**
 * The shell's own chrome action for switching the language, redeclared as a
 * literal: a screen bundle cannot import the shell app's constants, the way
 * the IDs above redeclare IDs mfe.json already carries. The shell owns the
 * action's schema and registers its handler on the screen domain; a screen
 * that sends the action lists this ID in its entry's `domainActions` (the
 * settings entry in `demo-mfe/mfe.json`), because that is the field for an
 * action the parent domain must support, while `actions[]` lists only the
 * actions the entry itself receives and handles. The payload carries
 * `language`, a language code of the shell's language code type.
 */
export const CHROME_ACTION_SET_LANGUAGE = 'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_language.v1~';

/**
 * Extension ID of the Widgets Host screen extension, owned by the shell's screen
 * domain. Mounting it evicts whatever else occupies that domain (e.g. Hello World
 * itself) per the shell's `ExclusiveMountStrategy`.
 */
export const WIDGETS_HOST_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.widgets.host.screen.v1';

/**
 * GTS instance ID of the widgets `ExtensionDomain` that Widgets Host takes
 * ownership of once mounted (`demo-mfe/mfe.json`'s `domains[]`, adopted in
 * `lifecycle-widgets-host.tsx` via `registry.registerDomain(...)`).
 */
export const WIDGETS_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.widgets.area.main.v1';

/**
 * Extension ID of widget-a's Widget Alpha instance (widgets-fixture-a), owned by the
 * nested Widgets Host and two hops away from the shell (shell -> Widgets Host ->
 * widgets domain -> widget-a). Pinging it from Hello World (one hop from shell)
 * exercises the downward forwarding-entry tier of cross-nesting action delivery.
 */
export const WIDGET_ALPHA_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';

/**
 * Custom action type used by widgets-fixture-a to demonstrate per-instance ping routing.
 * Targeted at the Widget Alpha extension ID — routed by the mediator to its registered ActionHandler.
 */
export const WIDGET_PING_ACTION_TYPE = 'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';
