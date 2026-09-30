import { useState } from 'react';
import { useScreenLayout } from './screenLayout';

export type SidebarToggle = {
  /** Whether the screen's secondary column is folded (or its sheet closed). */
  collapsed: boolean;
  /** Below the inline-column width the column opens as a sheet over the screen rather than beside the list. */
  overlay: boolean;
  toggle: () => void;
  /** Folds a column that lies over the screen; a column beside the list stays as it is. */
  dismiss: () => void;
};

/**
 * The open state of a screen's secondary column (channels, mailboxes, contact
 * filters), shared by every screen so the toggle behaves the same everywhere.
 *
 * The column starts open on a wide screen and folded below the inline-column
 * width (`SCREEN_BREAKPOINTS_REM.inlineColumn`), where it opens as a sheet over the list rather than beside it (see
 * `SideColumn`). The toggle flips it either way; the flip belongs to the width
 * it was made at, so crossing the breakpoint goes back to that width's default
 * rather than carrying a choice made for a different layout. A pick made in
 * the sheet (`dismiss`) folds it, so the list the pick changed shows.
 */
export function useSidebarToggle(): SidebarToggle {
  const isCompact = useScreenLayout() !== 'wide';
  const [choice, setChoice] = useState<{ compact: boolean; collapsed: boolean } | null>(null);
  const collapsed = choice !== null && choice.compact === isCompact ? choice.collapsed : isCompact;
  return {
    collapsed,
    overlay: isCompact,
    toggle: () => setChoice({ compact: isCompact, collapsed: !collapsed }),
    dismiss: () => {
      if (isCompact) setChoice({ compact: true, collapsed: true });
    },
  };
}
