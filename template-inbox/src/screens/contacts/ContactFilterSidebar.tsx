import {
  Badge,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from '@gears-frontx/ui-kit';
import type { Contact } from '../../api/types';
import type { Translate } from '../../shared/i18n';
import { SideColumn } from '../../shared/SideColumn';
import type { SidebarToggle } from '../../shared/useSidebarToggle';
import {
  CONTACT_FILTERS,
  CONTACT_FILTER_LABEL_KEY,
  countForFilter,
  type ContactFilter,
} from './contactFilters';
import sharedStyles from '../../shared/shared.module.css';

export type ContactFilterSidebarProps = {
  contacts: Contact[];
  selectedFilter: ContactFilter;
  onSelectFilter: (filter: ContactFilter) => void;
  column: SidebarToggle;
  /** Out of the page entirely (a contact's own page is open), not just folded. */
  hidden?: boolean;
  t: Translate;
};

export function ContactFilterSidebar({
  contacts,
  selectedFilter,
  onSelectFilter,
  column,
  hidden = false,
  t,
}: ContactFilterSidebarProps) {
  return (
    <SideColumn
      state={column}
      label={t('contact_filters')}
      title={t('contacts')}
      closeLabel={t('close')}
      hidden={hidden}
    >
      <nav className={sharedStyles.sidebarBody}>
        <ItemGroup>
          {CONTACT_FILTERS.map((filter) => (
            <Item
              key={filter}
              size="sm"
              className={sharedStyles.folderItem}
              variant={filter === selectedFilter ? 'muted' : 'default'}
              render={
                <button
                  type="button"
                  onClick={() => onSelectFilter(filter)}
                  aria-current={filter === selectedFilter ? 'true' : undefined}
                />
              }
            >
              <ItemContent>
                <ItemTitle>{t(CONTACT_FILTER_LABEL_KEY[filter])}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Badge variant="secondary">{countForFilter(contacts, filter)}</Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </SideColumn>
  );
}
