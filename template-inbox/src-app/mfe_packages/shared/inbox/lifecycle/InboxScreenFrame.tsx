import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { resolveNavigationHistory } from '@gears-frontx/routing';
import { adaptProviderHistory, EngineProvider, type AnyRoute } from '@gears-frontx/routing-tanstack';
import {
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
  readEntryAddress,
  type ChildMfeBridge,
} from '@gears-frontx/react';
import { useInboxTranslate, type InboxCatalogues } from '../i18n/useInboxTranslate';
import { requestScreenHeadingFocus } from '../ui/ScreenHeading';
import { kitThemeScopeFor } from './kitThemeScope';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';
import { InboxScreenContext, type InboxScreenContextValue } from './screenContext';
import { useBridgeProperty } from './useBridgeProperty';
import { directionFor, useHostDirection } from './useHostDirection';
import styles from './frame.module.css';

/** A package's route tree, as `createRootRoute(...).addChildren([...])` builds it. */
export type InboxRouteTree = AnyRoute;

export type InboxScreenFrameProps = {
  bridge: ChildMfeBridge;
  /** The package's own catalogues, merged over the shared ones. */
  catalogues: InboxCatalogues;
  /** The package's route tree, matched inside the entry the shell addressed for this screen. */
  routeTree: InboxRouteTree;
};

/**
 * Set on the page once any inbox screen has mounted. The first screen of a
 * page load leaves focus where the browser put it, as any page load does;
 * every later mount follows a navigation, and moves focus to its heading.
 */
const SCREEN_MOUNTED_KEY = Symbol.for('@gears-frontx/frontx-template-inbox/screen-mounted/v1');

type Realm = typeof globalThis & { [SCREEN_MOUNTED_KEY]?: true };

/**
 * Whether this mount should take focus: always after an earlier inbox screen
 * in the page, and on the first one only when something already holds focus
 * (a shell menu item the user just activated), never when the page has just
 * loaded with nothing focused. A read only, decided once per frame: marking
 * the page is the mount effect's job, so a render React repeats or discards
 * decides the same way.
 */
function mountTakesFocus(): boolean {
  if ((globalThis as Realm)[SCREEN_MOUNTED_KEY] === true) return true;
  const active = document.activeElement;
  return active !== null && active !== document.body;
}

const markScreenMounted = (): void => {
  (globalThis as Realm)[SCREEN_MOUNTED_KEY] = true;
};

/** Forgets that a screen mounted, so the next mount counts as the page's first. For tests. */
export const resetScreenMountFocus = (): void => {
  Reflect.deleteProperty(globalThis, SCREEN_MOUNTED_KEY);
};

/**
 * Everything an inbox screen needs around it inside its shadow root.
 *
 * - The kit's token scope: `data-theme` from the shell's theme property, so
 *   kit tokens resolve in the light or dark palette instead of inheriting
 *   whatever the shadow host carries.
 * - Direction: `dir` on the frame and on the shadow host, from the language.
 * - The portal node, rendered first, and the translator, both through
 *   `InboxScreenContext`.
 * - The screen's router: `EngineProvider` over the page history, composed
 *   into the entry the shell addressed for this screen (`route=` inside the
 *   screen's own segment), or matching the real URL when the shell
 *   broadcast no entry address.
 * - An error boundary, so a crashing screen leaves the shell working.
 * - `document.title` for the section and, after a navigation, focus on the
 *   screen heading. The shell touches neither.
 */
export function InboxScreenFrame({ bridge, catalogues, routeTree }: InboxScreenFrameProps) {
  const theme = useBridgeProperty<unknown>(bridge, FRONTX_SHARED_PROPERTY_THEME, 'light');
  const language = useBridgeProperty<unknown>(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');
  const t = useInboxTranslate(bridge, catalogues);
  const frameRef = useRef<HTMLDivElement>(null);
  const portalContainer = useRef<HTMLDivElement>(null);
  const languageCode = typeof language === 'string' ? language : 'en';
  useHostDirection(frameRef, languageCode);

  // One history per mount: the adapter reads the entry address once, and a
  // new one per render would hand the router a different history each time.
  const [history] = useState(() => adaptProviderHistory(resolveNavigationHistory(), readEntryAddress(bridge)));
  const [takesFocus] = useState(mountTakesFocus);

  // The page inside the screen, so a failure caught on one page clears once
  // the user moves to another instead of keeping the alert over every route.
  const pageKey = useSyncExternalStore(
    (onChange) => history.subscribe(onChange),
    () => history.location.pathname
  );

  useEffect(() => {
    document.title = t('document_title', { section: t('nav_label') });
  }, [t]);

  useEffect(() => {
    markScreenMounted();
    if (takesFocus) requestScreenHeadingFocus();
  }, [takesFocus]);

  const context = useMemo<InboxScreenContextValue>(() => ({ bridge, t, portalContainer }), [bridge, t]);

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      data-theme={kitThemeScopeFor(typeof theme === 'string' ? theme : 'light')}
      dir={directionFor(languageCode)}
    >
      <div ref={portalContainer} className={styles.portal} data-inbox-portal="" />
      <InboxScreenContext.Provider value={context}>
        <ScreenErrorBoundary t={t} resetKey={pageKey}>
          <EngineProvider routeTree={routeTree} history={history} />
        </ScreenErrorBoundary>
      </InboxScreenContext.Provider>
    </div>
  );
}
