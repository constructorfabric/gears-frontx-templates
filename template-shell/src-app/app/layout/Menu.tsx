/**
 * Menu Component
 *
 * Side navigation menu displaying MFE extensions with presentation metadata.
 * Uses local shadcn/ui Sidebar components for proper styling and collapsible behavior.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useAppSelector,
  useFrontX,
  useMountedExtensions,
  eventBus,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type MenuState,
} from '@gears-frontx/react';
import type { ScreenMenuItem } from '@gears-frontx/frontx-template-shell';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuIcon,
  SidebarHeader,
} from '@/app/components/ui/sidebar';
import { Icon } from '@iconify/react';
import { bootstrapOnce } from '@/app/mfe/bootstrapOnce';
import { shellScreens } from '@/app/mfe/shellScreens';
import { FrontXLogoIcon } from '@/app/icons/FrontXLogoIcon';
import { FrontXLogoTextIcon } from '@/app/icons/FrontXLogoTextIcon';

export interface MenuProps {
  children?: React.ReactNode;
}

interface MenuEntry {
  id: string;
  item: ScreenMenuItem;
}

const hintCodeClass = 'rounded bg-muted px-1.5 py-0.5 font-mono text-xs';

/**
 * Test id of the menu item that mounts `extensionId`.
 *
 * This is a verification API, not a styling hook: an unattended browser run
 * clicks screens through it, so the value is part of what the host promises
 * and may not be renamed to suit a stylesheet. Nothing in the app selects on
 * it. Without a stable handle a run addresses menu items through
 * accessibility references, which are re-issued on every navigation and every
 * theme switch, so each click costs a snapshot taken only to learn the
 * reference again.
 *
 * The extension id goes in verbatim, and it is the extension id rather than
 * the extension's `route` for two reasons. It is the identity the registry keys
 * on - the same value this component already uses as the React key and as the
 * mount subject - so two menu items cannot carry one id. The route is
 * a separate property: nothing stops two extensions declaring the
 * same route, so a route-derived id could collide. Verbatim also
 * means no slug step, which is its own collision risk - `a.b` and `a-b` slug to
 * one string, and extension ids are built from punctuation a slug would
 * flatten.
 */
export const menuItemTestId = (extensionId: string): string => `menu-item-${extensionId}`;

export const Menu: React.FC<MenuProps> = ({ children }) => {
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const app = useFrontX();
  const { mfeRegistry } = app;

  const collapsed = menuState?.collapsed ?? false;

  // Currently-mounted screen extension. Re-reads when a mount_ext/unmount_ext
  // settles. Index 0 is meaningful because the host registers the screen domain
  // with ExclusiveMountStrategy in `bootstrap.ts` (single mount per domain).
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const mountedId = mountedScreens[0]?.id;

  // `undefined` until bootstrap has settled: bootstrap registers every screen
  // extension, so the list is read once, after it, and an empty list before
  // that point means "not known yet", not "no screens".
  const [entries, setEntries] = useState<MenuEntry[] | undefined>(undefined);

  useEffect(() => {
    if (!mfeRegistry || !shellScreens.enabled) return;
    let cancelled = false;
    bootstrapOnce(app).then(
      () => {
        if (cancelled) return;
        // The project's reader turns each extension into a menu item, or
        // leaves it out by returning nothing; the default reads the flat
        // `presentation` of the shell's own screen schema.
        // A reader that throws on one extension costs only that extension.
        const read: MenuEntry[] = [];
        for (const ext of mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN)) {
          try {
            const item = shellScreens.readMenuItem(ext);
            if (item) read.push({ id: ext.id, item });
          } catch (error) {
            console.error(`[Menu] readMenuItem failed for ${ext.id}; the screen is left out of the menu`, error);
          }
        }
        setEntries(read.sort((a, b) => (a.item.order ?? 999) - (b.item.order ?? 999)));
      },
      // `MfeScreenContainer` logs the bootstrap failure; the menu only shows
      // that there is nothing to list.
      () => {
        if (!cancelled) setEntries([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [app, mfeRegistry]);

  // No registry means no microfrontends plugin: nothing is ever coming. A
  // project that turned the screen domain off has no screen items to list and
  // gets no hint about adding them.
  const screens = mfeRegistry ? entries : [];
  const showEmptyHint = shellScreens.enabled && screens?.length === 0;

  const handleToggleCollapse = () => {
    eventBus.emit('layout/menu/collapsed', { collapsed: !collapsed });
  };

  // Dispatch is acceptance-only: it returns void and never throws, so the
  // handler only hands the chain to the registry.
  const handleMenuItemClick = useCallback(
    (extensionId: string) => {
      if (!mfeRegistry) return;
      mfeRegistry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { subject: extensionId },
        },
      });
    },
    [mfeRegistry]
  );

  return (
    <Sidebar collapsed={collapsed}>
      {/* Logo/Brand area with collapse button */}
      <SidebarHeader
        logo={<FrontXLogoIcon />}
        logoText={!collapsed ? <FrontXLogoTextIcon /> : undefined}
        collapsed={collapsed}
        onClick={handleToggleCollapse}
      />

      {/* Menu items */}
      <SidebarContent>
        <SidebarMenu>
          {/* Before bootstrap settles `screens` is undefined and the menu stays blank. */}
          {showEmptyHint ? (
            // Reached from two different states, so the hint names the step that
            // tells them apart: a shell-only seed has no `src-app/mfe_packages/`
            // at all until the MFE template is added, and pointing such a
            // project at a scaffold it does not carry is a dead end.
            // list-none <li>: SidebarMenu renders a <ul>, whose only valid
            // direct children are <li> (axe: list, impact serious).
            <li className="list-none px-3 py-4 text-sm text-muted-foreground">
              No screens yet. If this project has no{' '}
              <code className={hintCodeClass}>src-app/mfe_packages/</code> directory, run{' '}
              <code className={hintCodeClass}>frontx add frontx-template-mfe</code> and{' '}
              <code className={hintCodeClass}>npm install</code> to get it. Then add a package by
              copying the <code className={hintCodeClass}>_blank-mfe</code> scaffold, and delete{' '}
              <code className={hintCodeClass}>templateExample</code> from the copy&rsquo;s{' '}
              <code className={hintCodeClass}>mfe.json</code> so it reaches this menu.
            </li>
          ) : (
            screens?.map(({ id, item }) => {
              const isActive = id === mountedId;
              return (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    data-testid={menuItemTestId(id)}
                    isActive={isActive}
                    onClick={() => handleMenuItemClick(id)}
                    tooltip={collapsed ? item.label : undefined}
                  >
                    {item.icon && (
                      <SidebarMenuIcon>
                        <Icon icon={item.icon} className="w-4 h-4" />
                      </SidebarMenuIcon>
                    )}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })
          )}
        </SidebarMenu>
      </SidebarContent>

      {children}
    </Sidebar>
  );
};

Menu.displayName = 'Menu';
