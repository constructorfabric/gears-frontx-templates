/**
 * Theme and language shared properties of the shell's MFE registry.
 *
 * The framework's MFE host plugin is type-system agnostic and publishes no
 * shared property itself: which properties a host publishes to its MFEs, and
 * under which type IDs, is the host's business. This shell publishes the
 * current theme ID and language under the template's GTS shared-property type
 * IDs, the ones its base domains declare in `sharedProperties`.
 *
 * @packageDocumentation
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-shared-property-broadcast:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-shared-property:p1

import {
  eventBus,
  type ChangeThemePayload,
  type FrontXApp,
  type SetLanguagePayload,
} from '@gears-frontx/react';
import type { MfeRegistry } from '@gears-frontx/react/mfe';
import {
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
} from '../../../src/index';

/**
 * Publishes the app's theme and language to `registry` as shared properties:
 * the current values at once, then every later change. Call it when the
 * registry is built, before any extension mounts, so MFEs start from the
 * current values. A failure is logged only; it never reaches the theme or
 * language change itself.
 *
 * @param app - The FrontX app whose theme and language are published
 * @param registry - The app's MFE registry
 * @returns Stops publishing later changes
 */
export function publishThemeAndLanguage(app: FrontXApp, registry: MfeRegistry): () => void {
  try {
    const theme = app.themeRegistry?.getCurrent();
    if (theme) {
      registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, theme.id);
    }
    const language = app.i18nRegistry?.getLanguage();
    if (language) {
      registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, language);
    }
  } catch (error) {
    console.error('[Gears FrontX] Failed to apply current theme/language to the MFE registry', error);
  }

  const subscriptions = [
    eventBus.on('theme/changed', (payload: ChangeThemePayload) => {
      try {
        registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, payload.themeId);
      } catch (error) {
        console.error('[Gears FrontX] Failed to propagate theme to MFE domains', error);
      }
    }),
    eventBus.on('i18n/language/changed', (payload: SetLanguagePayload) => {
      try {
        registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, payload.language);
      } catch (error) {
        console.error('[Gears FrontX] Failed to propagate language to MFE domains', error);
      }
    }),
  ];

  return () => {
    subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
  };
}
