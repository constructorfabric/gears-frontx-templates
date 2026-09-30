import { useMemo } from 'react';
import { CalendarDaysIcon, CircleDotIcon, ContactIcon, SearchIcon, TagIcon, UserRoundIcon } from 'lucide-react';
import {
  Badge,
  DataTable,
  DataTableSortButton,
  dataTableColumnHelper,
  Input,
} from '@gears-frontx/ui-kit';
import type { ActivityKind, ActivityStatus } from '@inbox-shared/api/dashboardTypes';
import type { Translate } from '@inbox-shared/i18n/translate';
import { labelOf, longRelativeTime, orDash } from '@inbox-shared/ui/format';
import { IdentityAvatar } from '@inbox-shared/ui/IdentityAvatar';
import { PresenceAvatar } from '@inbox-shared/ui/PresenceAvatar';
import type { ActivityRow } from './dashboardSelectors';
import styles from './dashboard.module.css';

export type ActivityTableProps = {
  /** The rows `resolvedActivity` keeps, the same list the summary counts. */
  rows: ActivityRow[];
  t: Translate;
};

const KIND_TONE: Record<ActivityKind, 'info' | 'accent' | 'secondary'> = {
  chat: 'info',
  mail: 'accent',
  task: 'secondary',
};

/*
 * `warning`, `success` and `danger` stay under the guardrails' 4.5:1 text
 * contrast in the light theme, a kit gap `deltaTone` describes; the label
 * spells the status out, so the tone is never the only signal.
 */
const STATUS_TONE: Record<ActivityStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  open: 'info',
  pending: 'warning',
  resolved: 'success',
  escalated: 'danger',
};

/**
 * Row 6's full-width table: a contact cell reusing the same identity data
 * the Contacts screen shows (avatar, name, company) so a person appearing
 * here reads as the same person there, plus the kind/status/owner/date
 * columns. Sorting and pagination come for free from the
 * kit's `DataTable`.
 *
 * Header dressing (per-column lucide icon, a live row count, an inert
 * search field) is the usual CRM activity-table header, built at template
 * level only, through `DataTable`'s own
 * composition points (`header` render functions) and this file's own CSS,
 * no kit changes. The search field carries no handler: this template does
 * no activity filtering, so it renders disabled rather than silently doing
 * nothing - the app's convention for a control with no action behind it
 * (the rail's profile entries, the thread header's create-ticket button).
 */
export function ActivityTable({ rows, t }: ActivityTableProps) {
  const columns = useMemo(() => {
    const column = dataTableColumnHelper<ActivityRow>();
    return column.columns([
      column.accessor((row) => row.contact.name, {
        id: 'contact',
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <ContactIcon aria-hidden="true" />
              {t('contact')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ row }) => (
          <div className={styles.activityContactCell}>
            <PresenceAvatar name={row.original.contact.name} presence={row.original.contact.presence} size="sm" t={t} />
            <span className={styles.activityContactLines}>
              <span className={styles.cellText}>{row.original.contact.name}</span>
              <span className={styles.activityContactCompany}>{orDash(row.original.contact.company)}</span>
            </span>
          </div>
        ),
      }),
      column.accessor('kind', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <TagIcon aria-hidden="true" />
              {t('kind')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => <Badge variant={KIND_TONE[getValue()]}>{labelOf(getValue(), t)}</Badge>,
      }),
      column.accessor('status', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <CircleDotIcon aria-hidden="true" />
              {t('status')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => <Badge variant={STATUS_TONE[getValue()]}>{labelOf(getValue(), t)}</Badge>,
      }),
      column.accessor('ownerName', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <UserRoundIcon aria-hidden="true" />
              {t('owner')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => {
          const name = getValue();
          return (
            <div className={styles.activityOwnerCell}>
              <IdentityAvatar name={name} size="sm" />
              <span className={styles.cellText}>{name}</span>
            </div>
          );
        },
      }),
      column.accessor('occurredAt', {
        header: ({ column: instance }) => (
          <DataTableSortButton column={instance}>
            <span className={styles.tableHeaderLabel}>
              <CalendarDaysIcon aria-hidden="true" />
              {t('date')}
            </span>
          </DataTableSortButton>
        ),
        cell: ({ getValue }) => longRelativeTime(getValue(), t),
      }),
    ]);
  }, [t]);

  return (
    <div className={styles.activitySection}>
      <div className={styles.activityToolbar}>
        <h2 className={styles.sectionHeading}>{t('recent_activity')}</h2>
        <span className={styles.activityCount}>{rows.length}</span>
        {/*
          The kit Input's own icon is absolutely positioned relative to its
          internal wrap, which is itself `width: 100%` of Input's immediate
          parent - so `margin-left: auto`/a fixed width need to sit on a
          wrapper div around Input, not on Input's own `className` (which
          targets the inner `<input>` only). Without this wrapper the wrap
          fills the whole flex row's remaining space and the icon stays
          pinned to that row's left edge instead of tracking the input box.
        */}
        <div className={styles.activitySearch}>
          <Input
            type="search"
            icon={<SearchIcon />}
            placeholder={t('search_activity')}
            disabled
            aria-label={t('search_activity')}
          />
        </div>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={t('no_activity')}
        previousLabel={t('previous_page')}
        nextLabel={t('next_page')}
      />
    </div>
  );
}
