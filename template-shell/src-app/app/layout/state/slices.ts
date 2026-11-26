// @cpt-dod:cpt-frontx-dod-framework-composition-layout:p1

/**
 * Layout Slices
 *
 * The shell's layout domain slices: header, footer, menu, sidebar, popup and
 * overlay state.
 *
 * State access: Components use `useAppSelector` hook from @gears-frontx/react.
 */

import { combineReducers, type Reducer } from '@reduxjs/toolkit';
import type {
  HeaderState,
  FooterState,
  MenuState,
  SidebarState,
  OverlayState,
} from './types';

import headerReducer, { headerSlice, headerActions, setUser, setLoading as setHeaderLoading, clearUser } from './headerSlice';
import footerReducer, { footerSlice, footerActions, setFooterVisible, setFooterConfig } from './footerSlice';
import menuReducer, {
  menuSlice,
  menuActions,
  toggleMenu,
  setMenuCollapsed,
  setMenuItems,
  setMenuVisible,
  setMenuConfig,
} from './menuSlice';
import sidebarReducer, {
  sidebarSlice,
  sidebarActions,
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
} from './sidebarSlice';
import popupReducer, {
  popupSlice,
  popupActions,
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  type PopupSliceState,
} from './popupSlice';
import overlayReducer, {
  overlaySlice,
  overlayActions,
  showOverlay,
  hideOverlay,
  setOverlayVisible,
} from './overlaySlice';

// ============================================================================
// Constants
// ============================================================================

export const LAYOUT_SLICE_NAME = 'layout' as const;

// ============================================================================
// Combined Layout Reducer
// ============================================================================

/** Explicit type for layout domain reducers */
export interface LayoutDomainReducersType {
  header: Reducer<HeaderState>;
  footer: Reducer<FooterState>;
  menu: Reducer<MenuState>;
  sidebar: Reducer<SidebarState>;
  popup: Reducer<PopupSliceState>;
  overlay: Reducer<OverlayState>;
}

// @cpt-begin:cpt-frontx-dod-framework-composition-layout:p1:inst-1
export const layoutDomainReducers: LayoutDomainReducersType = {
  header: headerReducer,
  footer: footerReducer,
  menu: menuReducer,
  sidebar: sidebarReducer,
  popup: popupReducer,
  overlay: overlayReducer,
};

export const layoutReducer = combineReducers(layoutDomainReducers);
// @cpt-end:cpt-frontx-dod-framework-composition-layout:p1:inst-1

// ============================================================================
// Slice Exports
// ============================================================================

export {
  // Slices
  headerSlice,
  footerSlice,
  menuSlice,
  sidebarSlice,
  popupSlice,
  overlaySlice,
  // Action groups
  headerActions,
  footerActions,
  menuActions,
  sidebarActions,
  popupActions,
  overlayActions,
  // Individual actions - header
  setUser,
  setHeaderLoading,
  clearUser,
  // Individual actions - footer
  setFooterVisible,
  setFooterConfig,
  // Individual actions - menu
  toggleMenu,
  setMenuCollapsed,
  setMenuItems,
  setMenuVisible,
  setMenuConfig,
  // Individual actions - sidebar
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
  // Individual actions - popup
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  // Individual actions - overlay
  showOverlay,
  hideOverlay,
  setOverlayVisible,
};

export type { PopupSliceState };
