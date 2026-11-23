"use client";

import { clsx } from "clsx";
import { CheckIcon, CircleAlertIcon, CopyIcon } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";

import type {
  CalendarAttendee,
  CalendarConflict,
  CalendarEvent,
  IanaTimeZone,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import { isSafeHttpUrl } from "../../react/controllers/use-event-detail-panel-controller";
import type { EventDetailPanelCopyStatus } from "../../react/public";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import { Avatar } from "../primitives/avatar/avatar";
import { Button } from "../primitives/button/button";
import { Separator } from "../primitives/separator/separator";
import { activationKeyDown } from "./event-detail-activation";
import {
  COPY_STATUS_KEYS,
  attendanceSummaryParts,
  formatAttendanceSummary,
  formatEventRange,
  formatRecurrenceSummary,
  formatZoneLine,
  guestCount,
} from "./event-detail-panel-format";

import styles from "./event-detail-panel.module.css";

export interface EventDetailRowProps {
  readonly children: ReactNode;
  /** Class added to the row's content. */
  readonly className?: string;
  /** The visible field label, above the row's content. Omit it when the text says what it is. */
  readonly label?: string;
}

export const EventDetailRow = ({
  children,
  className,
  label,
}: EventDetailRowProps) => (
  <section className={styles.row}>
    {label === undefined ? null : (
      <h3 className={styles.sectionLabel}>{label}</h3>
    )}
    <div className={clsx(styles.rowContent, className)}>{children}</div>
  </section>
);

export interface EventDetailSectionProps {
  readonly children?: ReactNode;
  /** Class added to the section. */
  readonly className?: string;
}

// An empty section is hidden by the stylesheet, and a rule is drawn only between sections with content.
export const EventDetailSection = ({
  children,
  className,
}: EventDetailSectionProps) => (
  <div className={clsx(styles.group, className)}>{children}</div>
);

// A horizontal rule for separating rows or sections a host adds itself.
export const EventDetailDivider = () => <Separator decorative />;

export const RestrictedSection = ({
  event,
}: {
  readonly event: CalendarEvent;
}) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  return (
    <div className={styles.group} role="note">
      <EventDetailRow label={t("calendar.detail.dateTime")}>
        <p className={styles.mutedText}>
          {formatEventRange(event, timeZone, locale)}
        </p>
      </EventDetailRow>
      <EventDetailRow>
        <p className={styles.mutedText}>{t("calendar.detail.restricted")}</p>
      </EventDetailRow>
    </div>
  );
};

const OrganizerSection = ({ event }: { readonly event: CalendarEvent }) => {
  const { t } = useCalendarLocalization();
  const organizer = event.organizer ?? "";
  const email = event.organizerEmail ?? "";

  if (organizer === "") {
    return null;
  }

  return (
    <EventDetailRow label={t("calendar.detail.organizer")}>
      <div className={styles.person}>
        <Avatar className={styles.stackAvatar} decorative name={organizer} />
        <div className={styles.personText}>
          <p className={styles.text}>{organizer}</p>
          {email === "" ? null : <p className={styles.personMeta}>{email}</p>}
        </div>
      </div>
    </EventDetailRow>
  );
};

interface CopyLinkButtonProps {
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly onCopy: () => void;
}

const CopyLinkButton = ({ copyStatus, onCopy }: CopyLinkButtonProps) => {
  const { t } = useCalendarLocalization();

  return (
    <Button
      variant="tertiary"
      size="m"
      leftIcon={copyStatus === "copied" ? <CheckIcon /> : <CopyIcon />}
      onClick={onCopy}
      onKeyDown={activationKeyDown(onCopy)}
    >
      {t(COPY_STATUS_KEYS[copyStatus])}
    </Button>
  );
};

interface ConferencingSectionProps {
  readonly canCopyJoinLink: boolean;
  readonly copyLink: (url?: string | null) => void;
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly joinUrl: string;
}

const ConferencingSection = ({
  canCopyJoinLink,
  copyLink,
  copyStatus,
  joinUrl,
}: ConferencingSectionProps) => {
  const { t } = useCalendarLocalization();

  return (
    <EventDetailRow label={t("calendar.detail.conferencing")}>
      {canCopyJoinLink ? (
        <div className={styles.conferencingRow}>
          <a
            className={styles.joinButton}
            href={joinUrl}
            rel="noreferrer"
            target="_blank"
          >
            {t("calendar.detail.join")}
          </a>
          <CopyLinkButton
            copyStatus={copyStatus}
            onCopy={() => copyLink(joinUrl)}
          />
        </div>
      ) : (
        <p className={styles.mutedText}>{joinUrl}</p>
      )}
    </EventDetailRow>
  );
};

const ActivitySection = ({
  copyLink,
  copyStatus,
  url,
}: {
  readonly copyLink: (url?: string | null) => void;
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly url: string;
}) => {
  const { t } = useCalendarLocalization();

  return (
    <EventDetailRow label={t("calendar.detail.activity")}>
      <div className={styles.conferencingRow}>
        <a
          className={styles.pageLink}
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          {t("calendar.detail.goToPage")}
        </a>
        <CopyLinkButton
          copyStatus={copyStatus}
          onCopy={() => copyLink(url)}
        />
      </div>
    </EventDetailRow>
  );
};

const EarlyReminderNotice = ({
  leadMinutes,
}: {
  readonly leadMinutes: number;
}) => {
  const { t } = useCalendarLocalization();
  const lead =
    leadMinutes === 0
      ? t("calendar.detail.reminderLead.now")
      : t("calendar.detail.reminderLead.minutes", { count: leadMinutes });

  return (
    <div className={styles.notice}>
      <CircleAlertIcon aria-hidden="true" className={styles.noticeIcon} />
      <p className={styles.noticeText}>
        {t("calendar.detail.earlyReminder", { lead })}
      </p>
    </div>
  );
};

interface ParticipantsSectionProps {
  readonly event: CalendarEvent;
  /** Lists every guest by response in place of the avatar stack. */
  readonly showAllGuests: boolean;
  readonly onShowAllGuests: () => void;
  readonly participantOverflowCount: number;
  readonly visibleParticipants: readonly CalendarAttendee[];
}

// +N swaps the stack for a scrolling guest list, so a large invite never fills the panel with avatars.
const ParticipantsSection = ({
  event,
  showAllGuests,
  onShowAllGuests,
  participantOverflowCount,
  visibleParticipants,
}: ParticipantsSectionProps) => {
  const { t } = useCalendarLocalization();

  if (guestCount(event) === 0) {
    return null;
  }

  return (
    <EventDetailRow
      label={t("calendar.detail.participants")}
      className={styles.participantsRow}
    >
      {showAllGuests ? (
        <GuestGroups attendees={event.attendees ?? []} />
      ) : (
        visibleParticipants.length > 0 && (
          <ul className={styles.avatarStack}>
            {visibleParticipants.map((participant) => (
              <li key={participant.id} title={participant.displayName}>
                <Avatar
                  className={styles.stackAvatar}
                  name={participant.displayName}
                />
              </li>
            ))}
            {participantOverflowCount > 0 && (
              <li>
                <button
                  type="button"
                  className={styles.stackOverflow}
                  aria-label={`+${participantOverflowCount} ${t("calendar.detail.participants.more")}`}
                  onClick={onShowAllGuests}
                >
                  +{participantOverflowCount}
                </button>
              </li>
            )}
          </ul>
        )
      )}
      <p className={styles.attendanceSummary}>
        {/* Read as one line; the dotted parts are only the visual form of it. */}
        <span className={styles.visuallyHidden}>
          {formatAttendanceSummary(event, t)}
        </span>
        {attendanceSummaryParts(event, t).map((part, index) => (
          <Fragment key={part}>
            {index > 0 && (
              <span aria-hidden="true" className={styles.summaryDot}>
                ●
              </span>
            )}
            <span aria-hidden="true">{part}</span>
          </Fragment>
        ))}
      </p>
    </EventDetailRow>
  );
};

const TimeZoneSection = ({
  comparisonTimeZone,
  event,
}: {
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly event: CalendarEvent;
}) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  if (event.allDay) {
    return null;
  }

  const zones =
    comparisonTimeZone === null || comparisonTimeZone === timeZone
      ? [timeZone]
      : [timeZone, comparisonTimeZone];

  return (
    <EventDetailRow label={t("calendar.detail.timeZone")}>
      {zones.map((zone) => (
        <p key={zone} className={styles.mutedText}>
          {formatZoneLine(event, zone, locale)}
        </p>
      ))}
    </EventDetailRow>
  );
};

// An attendee without a response is only invited; "awaiting" is a response the host reported.
type ResponseGroup = "yes" | "maybe" | "no" | "awaiting" | "unknown";

const RESPONSE_GROUPS: readonly ResponseGroup[] = [
  "yes",
  "no",
  "maybe",
  "awaiting",
  "unknown",
];

const GROUP_OF_RESPONSE: Readonly<
  Record<NonNullable<CalendarAttendee["response"]>, ResponseGroup>
> = {
  accepted: "yes",
  declined: "no",
  "needs-action": "awaiting",
  tentative: "maybe",
};

const responseGroup = ({ response }: CalendarAttendee): ResponseGroup =>
  response === null || response === undefined
    ? "unknown"
    : GROUP_OF_RESPONSE[response];

const GuestGroups = ({
  attendees,
}: {
  readonly attendees: readonly CalendarAttendee[];
}) => {
  const { t } = useCalendarLocalization();

  return RESPONSE_GROUPS.map((group) => {
    const members = attendees.filter(
      (attendee) => responseGroup(attendee) === group
    );

    if (members.length === 0) {
      return null;
    }

    return (
      <div key={group} className={styles.inviteeGroup}>
        <p className={styles.groupLabel}>
          {t(`calendar.detail.group.${group}`, { count: members.length })}
        </p>
        <ul className={styles.invitees}>
          {members.map((attendee) => (
            <li key={attendee.id} className={styles.person}>
              <Avatar
                className={styles.stackAvatar}
                decorative
                name={attendee.displayName}
              />
              <div className={styles.personText}>
                <p className={styles.text}>{attendee.displayName}</p>
                {(attendee.email ?? "") === "" ? null : (
                  <p className={styles.personMeta}>{attendee.email}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  });
};

const renderConflictDetail = (conflict: CalendarConflict) => (
  <>
    <span className={styles.conflictDimension}>{conflict.dimension}</span>
    <span className={styles.conflictLabel}>{conflict.label}</span>
    {typeof conflict.message === "string" && (
      <span className={styles.conflictMessage}>{conflict.message}</span>
    )}
  </>
);

export interface DefaultDetailProps {
  readonly canCopyJoinLink: boolean;
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly copyLink: (url?: string | null) => void;
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly event: CalendarEvent;
  readonly joinUrl: string | undefined;
  /** Opens the full guest list from the avatar stack's +N. */
  readonly onShowAllGuests: () => void;
  readonly participantOverflowCount: number;
  /** Lists every guest in place of the avatar stack. */
  readonly showAllGuests: boolean;
  readonly visibleParticipants: readonly CalendarAttendee[];
}

export const DefaultDetail = ({
  canCopyJoinLink,
  comparisonTimeZone,
  copyLink,
  copyStatus,
  event,
  joinUrl,
  onShowAllGuests,
  participantOverflowCount,
  showAllGuests,
  visibleParticipants,
}: DefaultDetailProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const recurrenceSummary = formatRecurrenceSummary(event, t, locale);
  const conflicts = event.conflicts ?? [];
  const location = event.location ?? "";
  const description = event.description ?? "";
  const isReminder = event.eventType === "reminder";
  const reminderUrl = isSafeHttpUrl(event.url) ? event.url : undefined;

  // Groups render even when every row in them is empty; the stylesheet hides empty groups and
  // draws a rule only between groups that have content.
  return (
    <>
      {event.notify ? (
        <EarlyReminderNotice leadMinutes={event.notify.leadMinutes} />
      ) : null}
      <EventDetailSection>
        <EventDetailRow label={t("calendar.detail.dateTime")}>
          <p className={styles.mutedText}>
            {formatEventRange(event, timeZone, locale)}
          </p>
          {recurrenceSummary !== undefined && (
            <p className={styles.mutedText}>{recurrenceSummary}</p>
          )}
        </EventDetailRow>
        {isReminder ? null : <OrganizerSection event={event} />}
        {joinUrl !== undefined && !isReminder && (
          <ConferencingSection
            canCopyJoinLink={canCopyJoinLink}
            copyLink={copyLink}
            copyStatus={copyStatus}
            joinUrl={joinUrl}
          />
        )}
        {isReminder ? null : (
          <ParticipantsSection
            event={event}
            showAllGuests={showAllGuests}
            onShowAllGuests={onShowAllGuests}
            participantOverflowCount={participantOverflowCount}
            visibleParticipants={visibleParticipants}
          />
        )}
        {reminderUrl === undefined ? null : (
          <ActivitySection
            copyLink={copyLink}
            copyStatus={copyStatus}
            url={reminderUrl}
          />
        )}
      </EventDetailSection>
      <EventDetailSection>
        {location !== "" && !isReminder && (
          <EventDetailRow label={t("calendar.detail.location")}>
            <p className={styles.mutedText}>{location}</p>
          </EventDetailRow>
        )}
        {conflicts.length > 0 && (
          <EventDetailRow label={t("calendar.detail.conflicts")}>
            <ConflictIndicator
              className={styles.conflicts}
              conflicts={conflicts}
              renderConflict={renderConflictDetail}
            />
          </EventDetailRow>
        )}
        <TimeZoneSection
          comparisonTimeZone={comparisonTimeZone}
          event={event}
        />
        {description !== "" && (
          <EventDetailRow label={t("calendar.detail.description")}>
            <p className={styles.description}>{description}</p>
          </EventDetailRow>
        )}
      </EventDetailSection>
    </>
  );
};
