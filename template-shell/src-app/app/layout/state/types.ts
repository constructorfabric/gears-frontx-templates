/**
 * Layout State Types
 *
 * The shape of the layout state the shell's layout slices manage, and the
 * payloads of the layout plugin's actions.
 */
// @cpt-dod:cpt-frontx-dod-framework-composition-layout:p1

import type { ComponentType } from 'react';

// ============================================================================
// Domain State Types
// ============================================================================

/** User info displayed in header */
export interface HeaderUser {
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

/** Header state with user info */
export interface HeaderState {
  user: HeaderUser | null;
  loading: boolean;
}

/** Header configuration */
export interface HeaderConfig {
  user?: HeaderUser;
}

/** Footer state */
export interface FooterState {
  visible: boolean;
}

/** Footer configuration */
export interface FooterConfig {
  visible?: boolean;
}

/** Menu item */
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
  disabled?: boolean;
}

/** Menu state */
export interface MenuState {
  collapsed: boolean;
  items: MenuItem[];
  visible: boolean;
}

/** Sidebar position */
export type SidebarPosition = 'left' | 'right';

/** Sidebar state */
export interface SidebarState {
  collapsed: boolean;
  position: SidebarPosition;
  title: string | null;
  content: unknown;
  visible: boolean;
  width: number;
}

/** Single popup state */
export interface PopupState {
  id: string;
  title: string;
  component: string;
  props?: Record<string, unknown>;
  zIndex: number;
}

/** Popup configuration */
export interface PopupConfig {
  id: string;
  title?: string;
  component: string;
  props?: Record<string, unknown>;
}

/** Overlay state */
export interface OverlayState {
  visible: boolean;
}

/** Overlay configuration */
export interface OverlayConfig {
  visible?: boolean;
}

// ============================================================================
// Combined Types
// ============================================================================

/** Combined layout state (legacy) */
export interface LayoutState {
  theme: string;
}

/** Layout domain state union */
export type LayoutDomainState =
  | HeaderState
  | FooterState
  | MenuState
  | SidebarState
  | PopupState
  | OverlayState;

/** Root state with layout */
export interface RootStateWithLayout {
  layout: {
    header: HeaderState;
    footer: FooterState;
    menu: MenuState;
    sidebar: SidebarState;
    popup: { stack: PopupState[] };
    overlay: OverlayState;
  };
}

/** Layout domain reducers type */
export type LayoutDomainReducers = Record<string, unknown>;

// ============================================================================
// Action Payloads
// ============================================================================

/** Show Popup Payload */
export interface ShowPopupPayload {
  id: string;
  title?: string;
  content?: () => Promise<{ default: ComponentType }>;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}
