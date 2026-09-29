import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { HashIcon, PlusIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@gears-frontx/ui-kit';
import type { Translate } from '../../shared/i18n';
import type { Channel } from '../../api/types';
import { cx } from '../../shared/cx';
import sharedStyles from '../../shared/shared.module.css';

const CHANNEL_ICON: Record<Channel['icon'], ReactElement> = {
  hash: <HashIcon />,
};

export type FolderSidebarProps = {
  channels: Channel[];
  selectedChannelId: string;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string) => void;
  collapsed: boolean;
  t: Translate;
};

export function FolderSidebar({
  channels,
  selectedChannelId,
  onSelectChannel,
  onCreateChannel,
  collapsed,
  t,
}: FolderSidebarProps) {
  const nameFieldId = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    onCreateChannel(trimmed);
    setName('');
    setCreateOpen(false);
  };

  return (
    <aside
      className={cx(sharedStyles.sidebar, collapsed && sharedStyles.sidebarCollapsed)}
      aria-label={t('channels')}
      // Kept in the tree while collapsed so the width transition has something
      // to animate; `inert` takes its controls out of the tab order and
      // `aria-hidden` keeps a zero-width column from being read out.
      aria-hidden={collapsed}
      inert={collapsed}
    >
      <div className={sharedStyles.paneHeader}>
        <span className={sharedStyles.paneTitle}>{t('chat')}</span>
        <span className={sharedStyles.spacer} />
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setName('');
          }}
        >
          <DialogTrigger
            render={
              <Button variant="ghost" size="sm" icon={<PlusIcon />} aria-label={t('new_channel')} />
            }
          />
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>{t('new_channel')}</DialogTitle>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor={nameFieldId}>{t('channel_name')}</FieldLabel>
                <Input
                  id={nameFieldId}
                  value={name}
                  onValueChange={setName}
                  placeholder={t('channel_name_placeholder')}
                  autoFocus
                />
              </Field>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  {t('cancel')}
                </DialogClose>
                <Button type="submit" disabled={name.trim() === ''}>
                  {t('create_channel')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <nav className={sharedStyles.sidebarBody}>
        <ItemGroup>
          {channels.map((channel) => (
            <Item
              key={channel.id}
              size="sm"
              className={cx(sharedStyles.folderItem, channel.id === selectedChannelId && sharedStyles.rowSelected)}
              variant={channel.id === selectedChannelId ? 'muted' : 'default'}
              render={
                <button
                  type="button"
                  onClick={() => onSelectChannel(channel.id)}
                  aria-current={channel.id === selectedChannelId ? 'true' : undefined}
                />
              }
            >
              <ItemMedia variant="icon">{CHANNEL_ICON[channel.icon]}</ItemMedia>
              <ItemContent>
                <ItemTitle>{channel.label}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Badge variant="secondary">{channel.itemCount}</Badge>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </nav>
    </aside>
  );
}
