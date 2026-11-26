/**
 * Sidebar Component
 *
 * Right-side panel for contextual content.
 * Seeded with the template; the project owns this file and edits it directly.
 */

import React from 'react';
import { useAppSelector } from '@gears-frontx/react';
import type { SidebarState } from './state';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  children?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ children }) => {
  const sidebarState = useAppSelector((state) => state['layout/sidebar'] as SidebarState | undefined);

  const visible = sidebarState?.visible ?? false;
  const collapsed = sidebarState?.collapsed ?? true;

  if (!visible) {
    return null;
  }

  return (
    <aside className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
      <div className={styles.body}>
        {children}
      </div>
    </aside>
  );
};

Sidebar.displayName = 'Sidebar';
