import {
  BlocksIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailIcon,
  MessageCircleIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import {
  Button,
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gears-frontx/ui-kit';
import type { ReactElement } from 'react';
import type { AgentIdentity } from '../api/types';
import { labelOf } from '../shared/format';
import { PresenceAvatar } from '../shared/PresenceAvatar';
import type { Translate } from '../shared/i18n';
import {
  CONTACTS_ROUTE,
  DASHBOARD_ROUTE,
  INBOX_ROUTE,
  MAIL_ROUTE,
  navigate,
  type Route,
} from './routing';
import type { Theme } from './theme';
import sharedStyles from '../shared/shared.module.css';
import styles from './App.module.css';

type RailSection = 'dashboard' | 'inbox' | 'mail' | 'contacts';

/** Which rail destination a route belongs to - a contact's own page keeps
 * Contacts lit. */
export const sectionOf = (route: Route): RailSection => {
  if (route.name === 'dashboard') return 'dashboard';
  if (route.name === 'inbox') return 'inbox';
  if (route.name === 'mail') return 'mail';
  return 'contacts';
};

/** The rail's destinations, top to bottom; the label is also the tooltip. */
const RAIL_SECTIONS: { section: RailSection; route: string; labelKey: string; icon: ReactElement }[] = [
  { section: 'dashboard', route: DASHBOARD_ROUTE, labelKey: 'dashboard', icon: <LayoutDashboardIcon /> },
  { section: 'inbox', route: INBOX_ROUTE, labelKey: 'chat', icon: <MessageCircleIcon /> },
  { section: 'mail', route: MAIL_ROUTE, labelKey: 'mail', icon: <MailIcon /> },
  { section: 'contacts', route: CONTACTS_ROUTE, labelKey: 'contacts', icon: <UsersIcon /> },
];

/** The rail label of the section a route belongs to, for the document title. */
export const sectionLabelKey = (route: Route): string =>
  RAIL_SECTIONS.find((entry) => entry.section === sectionOf(route))?.labelKey ?? 'dashboard';

export type IconRailProps = {
  route: Route;
  agent: AgentIdentity | undefined;
  theme: Theme;
  onToggleTheme: () => void;
  t: Translate;
};

/**
 * The app's own navigation column: the mark, the sections it ships, and -
 * pushed to the bottom by a flexible spacer - the theme toggle and the profile
 * menu.
 *
 * It is always narrow. The folder and filter columns beside it collapse; this
 * one is the fixed edge of the window that the rest of the layout is measured
 * from, so it has no collapsed state to be in.
 */
export function IconRail({ route, agent, theme, onToggleTheme, t }: IconRailProps) {
  const section = sectionOf(route);
  const isDark = theme === 'dark';

  return (
    <aside className={styles.rail} aria-label={t('main_navigation')}>
      <span className={styles.railMark} aria-hidden="true">
        <BlocksIcon />
      </span>

      <nav className={styles.railNav} aria-label={t('sections')}>
        <TooltipProvider>
          {RAIL_SECTIONS.map((entry) => (
            <Tooltip key={entry.section}>
              <TooltipTrigger
                render={
                  <Button
                    variant={section === entry.section ? 'secondary' : 'ghost'}
                    size="sm"
                    icon={entry.icon}
                    aria-label={t(entry.labelKey)}
                    aria-current={section === entry.section ? 'page' : undefined}
                    onClick={() => navigate(entry.route)}
                  />
                }
              />
              <TooltipContent side="right">{t(entry.labelKey)}</TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </nav>

      <span className={sharedStyles.spacer} />

      <Button
        variant="ghost"
        size="sm"
        icon={isDark ? <SunIcon /> : <MoonIcon />}
        aria-label={isDark ? t('switch_to_light') : t('switch_to_dark')}
        onClick={onToggleTheme}
      />

      <Popover>
        <PopoverTrigger className={styles.railIdentity} aria-label={t('open_profile_menu')}>
          <PresenceAvatar name={agent?.name ?? ''} presence={agent?.presence ?? 'offline'} t={t} />
        </PopoverTrigger>
        <PopoverContent side="right" align="end">
          <div className={sharedStyles.stack}>
            <div className={styles.railIdentityCard}>
              <PresenceAvatar name={agent?.name ?? ''} presence={agent?.presence ?? 'offline'} t={t} />
              <span className={styles.identityLines}>
                <span className={styles.identityName}>{agent?.name ?? t('loading')}</span>
                <span className={sharedStyles.identityMeta}>{agent ? labelOf(agent.presence, t) : ''}</span>
              </span>
            </div>
            <div className={sharedStyles.fieldRow}>
              <span className={sharedStyles.fieldLabel}>{t('workspace')}</span>
              <span className={sharedStyles.fieldValue}>{agent?.workspace ?? ''}</span>
            </div>
            <Separator aria-hidden="true" />
            {/*
              This template ships no screen behind profile, settings or log
              out, so each renders as a disabled button: the affordance shows
              where it goes without offering an action that does nothing.
            */}
            <ItemGroup>
              <Item size="sm" render={<button type="button" disabled />}>
                <ItemMedia variant="icon">
                  <UserIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('profile')}</ItemTitle>
                </ItemContent>
              </Item>
              <Item size="sm" render={<button type="button" disabled />}>
                <ItemMedia variant="icon">
                  <SettingsIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('settings')}</ItemTitle>
                </ItemContent>
              </Item>
              <Separator aria-hidden="true" />
              <Item size="sm" render={<button type="button" disabled />}>
                <ItemMedia variant="icon">
                  <LogOutIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('log_out')}</ItemTitle>
                </ItemContent>
              </Item>
            </ItemGroup>
          </div>
        </PopoverContent>
      </Popover>
    </aside>
  );
}
