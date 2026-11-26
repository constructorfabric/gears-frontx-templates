/**
 * Overlay Component
 *
 * Full-screen overlay for modals and loading states.
 * Seeded with the template; the project owns this file and edits it directly.
 */

import React from 'react';
import { useAppSelector } from '@gears-frontx/react';
import type { OverlayState } from './state';
import styles from './Overlay.module.css';

export interface OverlayProps {
  children?: React.ReactNode;
}

export const Overlay: React.FC<OverlayProps> = ({ children }) => {
  const overlayState = useAppSelector((state) => state['layout/overlay'] as OverlayState | undefined);
  const visible = overlayState?.visible ?? false;

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      {children}
    </div>
  );
};

Overlay.displayName = 'Overlay';
