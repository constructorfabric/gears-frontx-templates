import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { Button, Sheet, SheetClose, SheetContent, SheetTitle } from '@gears-frontx/ui-kit';
import { usePortalContainer } from '../lifecycle/screenContext';
import { cx } from './cx';
import type { SidebarToggle } from './useSidebarToggle';
import sharedStyles from './shared.module.css';

export type SideColumnProps = {
  /** The column's open state, from `useSidebarToggle`. */
  state: SidebarToggle;
  /** The accessible name of the inline column. */
  label: string;
  /** The header title; in the sheet it also names the dialog. */
  title: string;
  /** The header's own buttons, after the title. */
  actions?: ReactNode;
  /** Out of the page entirely, not just folded (a screen showing something the column does not filter). */
  hidden?: boolean;
  /** The name of the sheet's close button. */
  closeLabel: string;
  /** The column body, usually a `nav` with `.sidebarBody`. */
  children: ReactNode;
};

/**
 * A screen's secondary column (channels, mailboxes, contact filters), in the
 * form the width calls for.
 *
 * On a wide screen it is a column beside the list that folds to zero width.
 * Below the inline-column width (`state.overlay`) there is no room for it beside the
 * list and the thread: a column opened there would squeeze the list to a
 * sliver and its heading to nothing. So there it opens as the kit's `Sheet`
 * over the screen instead, which leaves the list at its own width underneath
 * and makes it inert while the sheet is open, and Escape, the backdrop or
 * the close button fold it again. The sheet portals into the frame's portal
 * node, so it stays inside the screen's shadow root.
 */
export function SideColumn({ state, label, title, actions, hidden = false, closeLabel, children }: SideColumnProps) {
  const portalContainer = usePortalContainer();
  if (state.overlay) {
    return (
      <Sheet
        open={!state.collapsed && !hidden}
        onOpenChange={(open) => {
          if (!open) state.dismiss();
        }}
      >
        <SheetContent
          side="left"
          showCloseButton={false}
          className={sharedStyles.sidebarSheet}
          container={portalContainer}
        >
          <div className={sharedStyles.sidebarSheetFrame}>
            <div className={sharedStyles.paneHeader}>
              <SheetTitle className={sharedStyles.paneTitle}>{title}</SheetTitle>
              <span className={sharedStyles.spacer} />
              {actions}
              <SheetClose render={<Button variant="ghost" size="sm" icon={<XIcon />} aria-label={closeLabel} />} />
            </div>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cx(sharedStyles.sidebar, state.collapsed && sharedStyles.sidebarCollapsed)}
      aria-label={label}
      // Kept in the tree while collapsed so the width transition has something
      // to animate; `inert` takes its controls out of the tab order and
      // `aria-hidden` keeps a zero-width column from being read out.
      aria-hidden={state.collapsed}
      inert={state.collapsed}
      hidden={hidden}
    >
      <div className={sharedStyles.paneHeader}>
        <span className={sharedStyles.paneTitle}>{title}</span>
        {actions ? (
          <>
            <span className={sharedStyles.spacer} />
            {actions}
          </>
        ) : null}
      </div>
      {children}
    </aside>
  );
}
