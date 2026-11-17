import type { ComponentType } from 'react';
import { i18nRegistry } from '@gears-frontx/react';

// Studio is developer tooling: a production build carries none of it. It is
// loaded before the first render so its restore of mock mode, theme and
// language runs in the same commit as the app instead of waiting for a lazy
// chunk to arrive. In a production build `import.meta.env.DEV` is the literal
// `false`, so the dynamic import below is dropped from the bundle. Studio
// registers its translation loader only as its module executes, after the
// initial language was already built, so the current language is loaded once
// more here to fetch the Studio namespaces. That reload runs in the
// background instead of being awaited: awaiting it would hold the first
// render for a second fetch of every app namespace. The registry notifies
// its subscribers as each namespace lands, so Studio re-renders once its
// translations arrive, and the registry logs its own load failures.
export async function loadStudioOverlay(): Promise<ComponentType | null> {
  if (!import.meta.env.DEV) {
    return null;
  }
  try {
    const studio = await import('@gears-frontx/studio');
    const language = i18nRegistry.getLanguage();
    if (language) {
      void i18nRegistry.loadLanguage(language);
    }
    return studio.StudioOverlay;
  } catch (error) {
    console.error('[Studio] failed to load; the app runs without it', error);
    return null;
  }
}
