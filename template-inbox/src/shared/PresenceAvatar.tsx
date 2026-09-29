import { Avatar, AvatarBadge, AvatarFallback, type AvatarProps } from '@gears-frontx/ui-kit';
import type { Presence } from '../api/types';
import { identityToneOf, initialsOf, labelOf } from './format';
import type { Translate } from './i18n';
import styles from './shared.module.css';

const PRESENCE_CLASS: Record<Presence, string> = {
  online: styles.presenceOnline,
  away: styles.presenceAway,
  offline: styles.presenceOffline,
};

export type PresenceAvatarProps = {
  name: string;
  presence: Presence;
  size?: AvatarProps['size'];
  t: Translate;
};

export function PresenceAvatar({ name, presence, size, t }: PresenceAvatarProps) {
  return (
    <Avatar size={size}>
      <AvatarFallback tone={identityToneOf(name)} variant="solid">
        {initialsOf(name)}
      </AvatarFallback>
      <AvatarBadge
        className={PRESENCE_CLASS[presence]}
        role="img"
        aria-label={labelOf(presence, t)}
      />
    </Avatar>
  );
}
