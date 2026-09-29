import { useState } from 'react';
import { COMPACT_QUERY, useMediaQuery } from './useMediaQuery';

export type SidebarToggle = {
  /** Whether the screen's secondary column is folded to zero width. */
  collapsed: boolean;
  toggle: () => void;
};

/**
 * The open state of a screen's secondary column (channels, mailboxes, contact
 * filters), shared by every screen so the toggle behaves the same everywhere.
 *
 * The column starts open on a wide viewport and folded below the compact
 * width, where it would squeeze the list. The toggle flips it either way; the
 * flip belongs to the width it was made at, so crossing the breakpoint goes
 * back to that width's default rather than carrying a choice made for a
 * different layout.
 */
export function useSidebarToggle(): SidebarToggle {
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const [choice, setChoice] = useState<{ compact: boolean; collapsed: boolean } | null>(null);
  const collapsed = choice !== null && choice.compact === isCompact ? choice.collapsed : isCompact;
  return {
    collapsed,
    toggle: () => setChoice({ compact: isCompact, collapsed: !collapsed }),
  };
}
