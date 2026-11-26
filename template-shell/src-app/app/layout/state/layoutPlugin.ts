/**
 * Layout Plugin - Provides all layout domain slices and effects
 *
 * The shell's own layout state: the header, footer, menu, sidebar, popup and
 * overlay slices, the layout events that drive them, and the layout actions
 * on `app.actions`.
 */

// @cpt-dod:cpt-frontx-dod-framework-composition-layout:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-app-config:p1

import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import { eventBus, type FrontXPlugin } from '@gears-frontx/react';
import type { ShowPopupPayload } from './types';
import {
  headerSlice,
  footerSlice,
  menuSlice,
  sidebarSlice,
  popupSlice,
  overlaySlice,
  footerActions,
  menuActions,
  sidebarActions,
  popupActions,
  overlayActions,
} from './slices';

// Layout events, typed on the app-layer event map
declare module '@gears-frontx/react' {
  interface EventPayloadMap {
    'layout/popup/requested': ShowPopupPayload;
    'layout/popup/hidden': void;
    'layout/overlay/requested': { id: string };
    'layout/overlay/hidden': void;
    'layout/menu/collapsed': { collapsed: boolean };
    'layout/sidebar/collapsed': { collapsed: boolean };
  }

  // Layout actions the plugin contributes to `app.actions`
  interface FrontXActions {
    showPopup: (payload: ShowPopupPayload) => void;
    hidePopup: () => void;
    showOverlay: (payload: { id: string }) => void;
    hideOverlay: () => void;
    toggleMenuCollapsed: (payload: { collapsed: boolean }) => void;
    toggleSidebarCollapsed: (payload: { collapsed: boolean }) => void;
    setHeaderVisible: (payload: boolean) => void;
    setFooterVisible: (payload: boolean) => void;
    setMenuCollapsed: (payload: boolean) => void;
    setSidebarCollapsed: (payload: boolean) => void;
  }
}

/**
 * Show popup action.
 */
function showPopup(payload: ShowPopupPayload): void {
  eventBus.emit('layout/popup/requested', payload);
}

/**
 * Hide popup action.
 */
function hidePopup(): void {
  eventBus.emit('layout/popup/hidden');
}

/**
 * Show overlay action.
 */
function showOverlay(payload: { id: string }): void {
  eventBus.emit('layout/overlay/requested', payload);
}

/**
 * Hide overlay action.
 */
function hideOverlay(): void {
  eventBus.emit('layout/overlay/hidden');
}

/**
 * Toggle menu collapsed action.
 */
function toggleMenuCollapsed(payload: { collapsed: boolean }): void {
  eventBus.emit('layout/menu/collapsed', payload);
}

/**
 * Toggle sidebar collapsed action.
 */
function toggleSidebarCollapsed(payload: { collapsed: boolean }): void {
  eventBus.emit('layout/sidebar/collapsed', payload);
}

/**
 * Wrapper for setHeaderVisible - no-op since HeaderState doesn't have visible field.
 * Kept for backward compatibility with FrontXActions interface.
 */
function setHeaderVisible(_visible: boolean): void {
  // No-op: HeaderState doesn't have visible field
}

/**
 * Layout plugin factory.
 *
 * @returns Layout plugin
 *
 * @example
 * ```typescript
 * const app = createFrontX()
 *   .use(layout())
 *   .build();
 * ```
 */
// @cpt-begin:cpt-frontx-dod-framework-composition-layout:p1:inst-1
export function layout(): FrontXPlugin {
  // eventBus subscriptions made in onInit, released in onDestroy.
  let subscriptions: Array<{ unsubscribe: () => void }> = [];

  return {
    name: 'layout',
    dependencies: [],

    provides: {
      slices: [
        headerSlice,
        footerSlice,
        menuSlice,
        sidebarSlice,
        popupSlice,
        overlaySlice,
      ],
      actions: {
        showPopup,
        hidePopup,
        showOverlay,
        hideOverlay,
        toggleMenuCollapsed,
        toggleSidebarCollapsed,
        // Direct slice actions for backward compatibility
        setHeaderVisible,
        setFooterVisible: footerActions.setFooterVisible,
        setMenuCollapsed: menuActions.setMenuCollapsed,
        setSidebarCollapsed: sidebarActions.setSidebarCollapsed,
      },
    },

    onInit(app) {
      const dispatch = app.store.dispatch as Dispatch<UnknownAction>;

      // Popup effects
      subscriptions.push(eventBus.on('layout/popup/requested', (payload: ShowPopupPayload) => {
        dispatch(popupActions.openPopup({
          id: payload.id,
          title: payload.title ?? '',
          component: '', // Payload doesn't include component - this needs review
        }));
      }));

      subscriptions.push(eventBus.on('layout/popup/hidden', () => {
        dispatch(popupActions.closeAllPopups());
      }));

      // Overlay effects
      subscriptions.push(eventBus.on('layout/overlay/requested', (_payload: { id: string }) => {
        dispatch(overlayActions.showOverlay());
      }));

      subscriptions.push(eventBus.on('layout/overlay/hidden', () => {
        dispatch(overlayActions.hideOverlay());
      }));

      // Menu effects
      subscriptions.push(eventBus.on('layout/menu/collapsed', (payload: { collapsed: boolean }) => {
        dispatch(menuActions.setMenuCollapsed(payload.collapsed));
      }));

      // Sidebar effects
      subscriptions.push(eventBus.on('layout/sidebar/collapsed', (payload: { collapsed: boolean }) => {
        dispatch(sidebarActions.setSidebarCollapsed(payload.collapsed));
      }));
    },

    onDestroy() {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      subscriptions = [];
    },
  };
}
// @cpt-end:cpt-frontx-dod-framework-composition-layout:p1:inst-1
