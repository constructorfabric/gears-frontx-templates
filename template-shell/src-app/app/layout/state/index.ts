/**
 * Layout State
 *
 * The shell's layout plugin, its slices, actions and state types.
 */

export { layout } from './layoutPlugin';

export {
  layoutReducer,
  layoutDomainReducers,
  LAYOUT_SLICE_NAME,
  // Domain slices
  headerSlice,
  footerSlice,
  menuSlice,
  sidebarSlice,
  popupSlice,
  overlaySlice,
  // Domain actions
  headerActions,
  footerActions,
  menuActions,
  sidebarActions,
  popupActions,
  overlayActions,
  // Individual reducer functions - header
  setUser,
  setHeaderLoading,
  clearUser,
  // Individual reducer functions - footer
  setFooterVisible,
  setFooterConfig,
  // Individual reducer functions - menu
  toggleMenu,
  setMenuCollapsed,
  setMenuItems,
  setMenuVisible,
  setMenuConfig,
  // Individual reducer functions - sidebar
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarPosition,
  setSidebarTitle,
  setSidebarContent,
  setSidebarVisible,
  setSidebarWidth,
  setSidebarConfig,
  // Individual reducer functions - popup
  openPopup,
  closePopup,
  closeTopPopup,
  closeAllPopups,
  // Individual reducer functions - overlay
  showOverlay,
  hideOverlay,
  setOverlayVisible,
} from './slices';

export type { PopupSliceState } from './slices';

export type {
  HeaderUser,
  HeaderState,
  HeaderConfig,
  FooterState,
  FooterConfig,
  MenuItem,
  MenuState,
  SidebarPosition,
  SidebarState,
  PopupState,
  PopupConfig,
  OverlayState,
  OverlayConfig,
  LayoutState,
  LayoutDomainState,
  RootStateWithLayout,
  LayoutDomainReducers,
  ShowPopupPayload,
} from './types';

export { getLayoutDomainState, hasNewLayoutState } from './migration';
