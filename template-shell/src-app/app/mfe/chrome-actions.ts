/**
 * The host chrome contract: the actions a microfrontend may dispatch upward to
 * change the shell around it.
 *
 * A microfrontend runs in its own module graph (per-load blob instantiation,
 * ADR-0011), so it has no handle on the host app and no shared event bus to
 * emit on. The actions chain is the one declared upward channel, and it carries
 * a payload. These action types are what this shell chooses to expose over
 * it; the handlers live in the domain implementations that answer them
 * (`screenDomain.ts`, `modalDomain.ts`).
 *
 * They are app-layer, not framework: `screenDomain` in
 * `@gears-frontx/framework` ships to every template, and a host that does not
 * want its chrome driven from a microfrontend simply does not spread these into
 * its own screen-domain declaration.
 */

import type { JSONSchema } from '@gears-frontx/gts-plugin';

import setLanguageActionSchema from './gts/frontx.screensets/schemas/chrome/set_language.v1.json';
import setMenuCollapsedActionSchema from './gts/frontx.screensets/schemas/chrome/set_menu_collapsed.v1.json';
import setThemeActionSchema from './gts/frontx.screensets/schemas/chrome/set_theme.v1.json';
import refreshPageActionSchema from './gts/frontx.screensets/schemas/chrome/refresh_page.v1.json';
import signInActionSchema from './gts/frontx.screensets/schemas/chrome/sign_in.v1.json';

/** Applies a registered theme by id - the payload carries `themeId`. */
export const CHROME_SET_THEME =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_theme.v1~';

/** Collapses or expands the shell's main menu - the payload carries `collapsed`. */
export const CHROME_SET_MENU_COLLAPSED =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_menu_collapsed.v1~';

/** Switches the shell's language - the payload carries `language`. */
export const CHROME_SET_LANGUAGE =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.set_language.v1~';

/**
 * Runs the shell's sign-in flow on the popup domain: the action resolves once
 * a session exists and unmounts the sign-in modal. It carries no payload at
 * all - the sign-in extension signs in through the shared auth runtime, never
 * through the action - and its sender is expected to give it a long timeout,
 * since it spans a user typing credentials.
 */
export const CHROME_SIGN_IN =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.sign_in.v1~';

/**
 * Reloads the page, so whatever ran under a session that is gone runs again:
 * the tail of the sign-in chain, and the fallback of every stage of it.
 */
export const CHROME_REFRESH_PAGE =
  'gts.frontx.mfes.comm.action.v1~frontx.screensets.chrome.refresh_page.v1~';

/**
 * The schemas of the chrome actions the screen domain answers, registered by
 * `screenDomain.ts` together with the screen extension type, before the
 * manifest walk. `sign_in` is answered by the popup domain, not this one, so
 * its schema travels with `CHROME_MODAL_ACTION_SCHEMAS` below.
 *
 * The schemas themselves are JSON, under
 * `gts/frontx.screensets/schemas/chrome/`, where the directory path spells the
 * GTS id the way `packages/gts-plugin/src/frontx.mfes/schemas/ext/` and the
 * framework's own `gts/frontx.screensets/instances/domains/` do. Each file
 * carries its own `$comment`s, including why its `target` names one domain
 * rather than any domain; this module only collects them.
 *
 * The cast is the same one both of those loaders make: a JSON module's inferred
 * type is the literal shape of the file, which no `JSONSchema` signature can be
 * written to accept.
 *
 * They must reach the type system before `registerDomain`, because the mediator
 * resolves an action's schema from its `type` at dispatch time and rejects an
 * action it cannot validate.
 *
 * Unlike the theme and menu schemas, whose payload fields are declared inline,
 * set_language constrains its payload through a `$ref` to
 * `gts://gts.frontx.i18n.lang.code.v1~`, the SDK's language list. Registering
 * this array on a type system therefore also requires `languageCodeSchema`
 * (`src/gts`) on that same type system, registered
 * ahead of these schemas: `registerSchema` resolves no references itself.
 */
export const CHROME_ACTION_SCHEMAS: JSONSchema[] = [
  setThemeActionSchema as JSONSchema,
  setMenuCollapsedActionSchema as JSONSchema,
  setLanguageActionSchema as JSONSchema,
  refreshPageActionSchema as JSONSchema,
];

/**
 * The schemas of the chrome actions the popup domain - the modal extension
 * domain - answers, registered by `modalDomain.ts` together with the modal
 * extension type.
 */
export const CHROME_MODAL_ACTION_SCHEMAS: JSONSchema[] = [
  signInActionSchema as JSONSchema,
];
