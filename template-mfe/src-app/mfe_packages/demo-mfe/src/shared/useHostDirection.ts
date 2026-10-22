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
 * Usage in screen component:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const language = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');
 * useHostDirection(containerRef, language);
 * ```
 */

import { useEffect, type RefObject } from 'react';

const RTL_LANGUAGES: readonly string[] = ['ar', 'he', 'fa', 'ur'];

/**
 * Whether a language is written right-to-left. Only the primary subtag
 * decides, so a region-tagged code such as `ar-EG` reads as Arabic.
 */
function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.includes(language.split('-')[0].toLowerCase());
}

/**
 * Hook syncing the Shadow DOM host element's `dir` attribute to the language.
 *
 * @param containerRef - Ref to any element rendered inside the MFE's shadow root
 * @param language - Active language code (e.g. 'en', 'ar', 'ar-EG')
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
      (rootNode.host as HTMLElement).dir = isRtlLanguage(language) ? 'rtl' : 'ltr';
    }
  }, [containerRef, language]);
}
