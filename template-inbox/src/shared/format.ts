/**
 * Display formatting shared by every screen.
 *
 * Everything here is computed at render from the ISO instants the data
 * carries, never stored: a conversation that read "1h" when the tab opened
 * reads "2h" an hour later without a refetch. Every formatter writes in the
 * catalogue's `locale`, and every word comes from the catalogue or from `Intl`
 * itself, so a second language changes the catalogue and nothing here.
 */

import type { ActivityKind, ActivityStatus } from '../api/dashboardTypes';
import type {
  ContactType,
  ConversationChannel,
  ConversationPriority,
  ConversationStatus,
  Presence,
  TicketPriority,
  TicketStatus,
} from '../api/types';
import { locale, type Translate } from './i18n';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const dateFormat = new Intl.DateTimeFormat(locale, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** No year - the transcript's date dividers separate days within a visible
 * window, not years, so a divider reads "Jun 7". */
const dividerDateFormat = new Intl.DateTimeFormat(locale, {
  month: 'short',
  day: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat(locale, {
  hour: 'numeric',
  minute: '2-digit',
});

const dateTimeFormat = new Intl.DateTimeFormat(locale, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short' });

const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short' });

const relativeTimeFormat = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });

/** "26m", "1h", "4d" in English: a unit's narrowest form in the app's locale. */
const narrowUnit = (unit: 'minute' | 'hour' | 'day') =>
  new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' });

const narrowMinutes = narrowUnit('minute');
const narrowHours = narrowUnit('hour');
const narrowDays = narrowUnit('day');

/** The conversation list's compact form: "26m", "1h", "4d". */
export const shortRelativeTime = (iso: string, now: number = Date.now()): string => {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < HOUR_MS) return narrowMinutes.format(Math.max(1, Math.floor(elapsed / MINUTE_MS)));
  if (elapsed < DAY_MS) return narrowHours.format(Math.floor(elapsed / HOUR_MS));
  return narrowDays.format(Math.floor(elapsed / DAY_MS));
};

/** The contacts table and the activity timeline: "3 hours ago", "2 months ago". */
export const longRelativeTime = (iso: string, t: Translate, now: number = Date.now()): string => {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < MINUTE_MS) return t('just_now');
  if (elapsed < HOUR_MS) return relativeTimeFormat.format(-Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return relativeTimeFormat.format(-Math.floor(elapsed / HOUR_MS), 'hour');
  if (elapsed < MONTH_MS) return relativeTimeFormat.format(-Math.floor(elapsed / DAY_MS), 'day');
  if (elapsed < YEAR_MS) return relativeTimeFormat.format(-Math.floor(elapsed / MONTH_MS), 'month');
  return relativeTimeFormat.format(-Math.floor(elapsed / YEAR_MS), 'year');
};

/** Calendar text for the dates a contact detail shows: "Jun 27, 2025". */
export const absoluteDate = (iso: string): string =>
  iso === '' ? MISSING_VALUE : dateFormat.format(new Date(iso));

/** A chart axis's day name: "Mon". */
export const weekdayLabel = (iso: string): string => weekdayFormat.format(new Date(iso));

/** A chart axis's month name: "Jan". */
export const monthLabel = (iso: string): string => monthFormat.format(new Date(iso));

/** A date and a time together, for a mail history card: "Aug 21, 2026, 8:21 AM". */
export const dateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

/**
 * A transcript message's day-boundary key: its local calendar date. Two
 * messages share a divider exactly when their keys match; the key itself is
 * never shown.
 */
export const messageDayKey = (iso: string): string => {
  const at = new Date(iso);
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
};

/** A date divider's own label: "Aug 21" - month and day only. */
export const messageDayLabel = (iso: string): string => dividerDateFormat.format(new Date(iso));

/** The in-bubble timestamp: the time of day only ("8:21 AM") - the divider
 * above the message group already carries the date. */
export const messageTimeOfDay = (iso: string): string => timeFormat.format(new Date(iso));

/** What the app renders wherever a contact field has no value. */
export const MISSING_VALUE = '-';

export const orDash = (value: string): string => (value === '' ? MISSING_VALUE : value);

/**
 * The avatar fallback's letters. Derived rather than stored: a name is the only
 * input, so a second field would just be another thing to keep in step.
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

/** The kit's identity-fill tones, shared by every avatar this app renders
 * (`PresenceAvatar`, `IdentityAvatar`). Picked from a hash of the name so the
 * same person keeps the same circle everywhere they appear - a list row, a
 * thread header, a details panel - without tracking any state of its own. */
const IDENTITY_TONES = ['accent', 'info', 'success', 'warning', 'danger', 'neutral'] as const;

export const identityToneOf = (name: string): (typeof IDENTITY_TONES)[number] => {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return IDENTITY_TONES[hash % IDENTITY_TONES.length];
};

/** The contacts table's own column, read off the address rather than stored. */
export const emailDomain = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at === -1 ? MISSING_VALUE : email.slice(at + 1);
};

/** Every closed vocabulary the app renders a label for. */
export type LabelledValue =
  | ConversationPriority
  | ConversationStatus
  | ConversationChannel
  | ContactType
  | Presence
  | TicketPriority
  | TicketStatus
  | ActivityKind
  | ActivityStatus;

const LABEL_KEY: Record<LabelledValue, string> = {
  none: 'label_no_priority',
  low: 'label_low',
  medium: 'label_medium',
  high: 'label_high',
  urgent: 'label_urgent',
  open: 'label_open',
  snoozed: 'label_snoozed',
  closed: 'label_closed',
  pending: 'label_pending',
  chat: 'label_chat',
  email: 'label_email',
  user: 'label_user',
  lead: 'label_lead',
  online: 'label_online',
  offline: 'label_offline',
  away: 'label_away',
  mail: 'label_mail',
  task: 'label_task',
  resolved: 'label_resolved',
  escalated: 'label_escalated',
};

/**
 * The label for a closed vocabulary value, from the catalogue. A key per value
 * rather than a key built from the value, because a value does not always
 * read as its label ("none" reads "No priority"). Typed over the vocabularies
 * themselves, so a value with no label is a type error rather than raw text
 * on screen.
 */
export const labelOf = (value: LabelledValue, t: Translate): string => t(LABEL_KEY[value]);
