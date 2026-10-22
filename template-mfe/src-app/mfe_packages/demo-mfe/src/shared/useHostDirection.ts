/**
 * useHostDirection Hook
 *
 * Keeps the Shadow DOM host's text direction (`dir`) in sync with the active
 * language:
 *
 * 1. An effect keyed by `language` (rather than logic inside a bridge
 *    subscription callback) also covers the initial language, which never
 *    fires a callback.
 * 2. A DOM host mutation has to wait for commit, so this lives in an effect
 *    rather than the render body.
 * 3. Outside a Shadow DOM the hook is a no-op.
 *
 * `_blank-mfe` carries a copy of this module at the same path, for the same
 * reason as its copy of `kitThemeScope`: an MFE package never imports from a
 * sibling MFE package.
 *
 * Usage in screen component:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const language = useSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, { bridge, fallback: 'en' });
 * useHostDirection(containerRef, language);
 * ```
 */

import { useEffect, type RefObject } from 'react';

const RTL_LANGUAGES: readonly string[] = ['ar', 'he', 'fa', 'ur'];

/**
 * Hook syncing the Shadow DOM host element's `dir` attribute to the language.
 *
 * @param containerRef - Ref to any element rendered inside the MFE's shadow root
 * @param language - Active language code (e.g. 'en', 'ar')
 */
export function useHostDirection(
  containerRef: RefObject<HTMLElement | null>,
  language: string
): void {
  useEffect(() => {
    const rootNode = containerRef.current?.getRootNode();
    if (rootNode && 'host' in rootNode) {
      // The `in` check narrows Node only to Node & Record<'host', unknown>,
      // so the cast to HTMLElement is forced.
      (rootNode.host as HTMLElement).dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
    }
  }, [containerRef, language]);
}
