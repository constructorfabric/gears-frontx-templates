/**
 * Menu Component
 *
 * Side navigation menu displaying MFE extensions with presentation metadata.
 * Uses local shadcn/ui Sidebar components for proper styling and collapsible behavior.
 */

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  useAppSelector,
  useFrontX,
  eventBus,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type MenuState,
  type ScreenExtension,
} from '@gears-frontx/react';
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
import { screenState } from '@/app/mfe/screenState';
import { FrontXLogoIcon } from '@/app/icons/FrontXLogoIcon';
import { FrontXLogoTextIcon } from '@/app/icons/FrontXLogoTextIcon';

export interface MenuProps {
  children?: React.ReactNode;
}

type RegistryScreenExtension = Omit<ScreenExtension, 'route'>;

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

  // Currently-mounted screen extension, as the screen domain's container
  // hooks recorded it: creating a screen's container sets it, destroying the
  // container that holds it clears it.
  const mountedId = useSyncExternalStore(screenState.subscribe, screenState.getSnapshot);

  // Registry reads carry no `route`, so the menu holds the screen extension
  // shape without it.
  // `undefined` until bootstrap has settled: bootstrap registers every screen
  // extension, so the list is read once, after it, and an empty list before
  // that point means "not known yet", not "no screens".
  const [extensions, setExtensions] = useState<RegistryScreenExtension[] | undefined>(undefined);

  useEffect(() => {
    if (!mfeRegistry) return;
    let cancelled = false;
    bootstrapOnce(app).then(
      () => {
        if (cancelled) return;
        // The cast asserts `presentation` rather than checking it, and nothing
        // between the manifest and `registry.registerExtension` does either, so
        // an extension without it is dropped here instead of throwing mid-sort.
        const screenExts = mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN) as RegistryScreenExtension[];
        setExtensions(
          screenExts
            .filter((ext) => ext?.presentation)
            .sort((a, b) => (a.presentation.order ?? 999) - (b.presentation.order ?? 999)),
        );
      },
      // `MfeScreenContainer` logs the bootstrap failure; the menu only shows
      // that there is nothing to list.
      () => {
        if (!cancelled) setExtensions([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [app, mfeRegistry]);

  // No registry means no microfrontends plugin: nothing is ever coming.
  const screens = mfeRegistry ? extensions : [];

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
          {screens?.length === 0 ? (
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
            screens?.map((ext) => {
              const isActive = ext.id === mountedId;
              const pres = ext.presentation;
              return (
                <SidebarMenuItem key={ext.id}>
                  <SidebarMenuButton
                    data-testid={menuItemTestId(ext.id)}
                    isActive={isActive}
                    onClick={() => handleMenuItemClick(ext.id)}
                    tooltip={collapsed ? pres.label : undefined}
                  >
                    {pres.icon && (
                      <SidebarMenuIcon>
                        <Icon icon={pres.icon} className="w-4 h-4" />
                      </SidebarMenuIcon>
                    )}
                    <span>{pres.label}</span>
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
