/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FrontXProvider, apiRegistry, createFrontX, presets } from '@gears-frontx/react';
import { AccountsApiService } from '@/app/api';
import { devAuthPlugins, wireDevSignInTriggers } from '@/app/auth/devAuth';
import '@/app/events/bootstrapEvents'; // Register app-level events (type augmentation)
import '@/app/i18n/shellTranslations'; // Register the shell namespace's translation loader before the first render
import { applyPersistedLanguage } from '@/app/i18n/languagePersistence'; // Restore the remembered language before the first render
import { registerBootstrapEffects } from '@/app/effects/bootstrapEffects'; // Register app-level effects
import App from './App';
// The no-kit build loads neither the kit's stylesheet nor the shell themes,
// so the token defaults the layout's var() references resolve against come
// from this import (src-app/app/themes/none-build.css).
import './themes/none-build.css';
import { loadStudioOverlay } from './studioOverlay';

// Register accounts service (application-level service for user info)
apiRegistry.register(AccountsApiService);

// Initialize API services
apiRegistry.initialize({});

// Create FrontX app instance (no theme support when using --uikit none)
// No UI component library included
// The auth plugin rides with the preset's config in the framework docs, but the
// exported `Presets` type declares `full` without arguments, so this template
// adds `auth()` on the builder. The plugin is the same one `full({ auth })`
// would append, dependencies included.
const app = createFrontX()
  .useAll(presets.full())
  // The development auth plugins (`app/auth/devAuth.ts`): that module passes
  // no auth config outside development, so a production build carries neither
  // the auth plugin nor the realm plugin. The trigger only becomes observable
  // once the project adds the microfrontends plugin, since the chain needs the
  // domains it registers; until then both triggers are wired and simply send
  // nothing.
  .use(devAuthPlugins())
  .build();

// The sign-in triggers: a 401, or a start with no session, sends the chain that
// opens the sign-in modal. Wired only where the development auth config exists;
// a production build wires no trigger here and only removes a sign-in entry
// the page-load address named (`removeSignInEntryAtPageLoad`).
wireDevSignInTriggers(app);

// Register app-level effects (pass store dispatch)
registerBootstrapEffects(app.store.dispatch);

// Apply the language the user chose in an earlier session (the i18n plugin's
// startup English, not stored, on a first visit), and remember every later
// change, whatever sent it. Runs after the build so the i18n plugin's
// subscription is in place, and before the first render.
applyPersistedLanguage();

/**
 * Render application
 * Bootstrap happens automatically when Layout mounts
 *
 * Flow:
 * 1. App renders → Layout mounts → bootstrap dispatched
 * 2. Components show skeleton loaders (translationsReady = false)
 * 3. User fetched → language set → translations loaded
 * 4. Components re-render with actual text (translationsReady = true)
 *
 * Note: Mock API is controlled via the FrontX Studio panel.
 * The mock plugin (included in full preset) handles mock plugin lifecycle automatically.
 *
 * This template is for projects created with --uikit none.
 * No UI component library is included (no Toaster, no themes, no styles).
 * User provides their own UI components and theme system.
 */
// Studio is dev tooling whose provider restores mock mode, theme and language
// on mount. Without top-level await the render waits for loadStudioOverlay()
// so that restore runs in the same commit as the app; in a production build
// loadStudioOverlay() resolves to null and no Studio is rendered.
void loadStudioOverlay()
  .then((StudioOverlay) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <FrontXProvider app={app}>
          <App StudioOverlay={StudioOverlay} />
        </FrontXProvider>
      </StrictMode>
    );
  })
  .catch((error: unknown) => {
    console.error('[app] failed to render', error);
  });
