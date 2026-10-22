"use client";

import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  GlobeIcon,
  LockIcon,
  MapPinIcon,
  TextAlignStartIcon,
  TriangleAlertIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  CalendarAttendee,
  CalendarConflict,
  CalendarEvent,
  IanaTimeZone,
} from "../../core/model";
import { useCalendarContext } from "../../i18n/calendar-context";
import { useCalendarLocalization } from "../../i18n/calendar-localization";
import type { EventDetailPanelCopyStatus } from "../../react/public";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import { Avatar } from "../primitives/avatar/avatar";
import { Button } from "../primitives/button/button";
import { activationKeyDown } from "./event-detail-activation";
import {
  COPY_STATUS_KEYS,
  formatEventRange,
  formatRecurrenceSummary,
  formatRsvpResponses,
  formatZoneLine,
  guestCount,
} from "./event-detail-panel-format";

import styles from "./event-detail-panel.module.css";

interface DetailRowProps {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  /** Names the row for screen readers; the icon stands in for it on screen. Omit when the row's
   * text already says what it is. */
  readonly label?: string;
}

const DetailRow = ({ children, icon, label }: DetailRowProps) => (
  <section className={styles.row}>
    {label === undefined ? null : (
      <h3 className={styles.sectionLabel}>{label}</h3>
    )}
    <span aria-hidden="true" className={styles.rowIcon}>
      {icon}
    </span>
    <div className={styles.rowContent}>{children}</div>
  </section>
);

export const RestrictedSection = ({
  event,
}: {
  readonly event: CalendarEvent;
}) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  return (
    <div className={styles.group} role="note">
      <DetailRow icon={<ClockIcon />} label={t("calendar.detail.dateTime")}>
        <p className={styles.text}>
          {formatEventRange(event, timeZone, locale)}
        </p>
      </DetailRow>
      <DetailRow icon={<LockIcon />}>
        <p className={styles.mutedText}>{t("calendar.detail.restricted")}</p>
      </DetailRow>
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
    // Avatars belong to the guest list; here the row keeps the grey icon every other row has.
    <DetailRow icon={<UserIcon />} label={t("calendar.detail.organizer")}>
      <p className={styles.text}>{organizer}</p>
      <p className={styles.personMeta}>
        {email === "" ? t("calendar.detail.organizer") : email}
      </p>
    </DetailRow>
  );
};

interface ConferencingSectionProps {
  readonly canCopyJoinLink: boolean;
  readonly copyLink: () => void;
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
    <DetailRow icon={<VideoIcon />} label={t("calendar.detail.conferencing")}>
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
          <Button
            variant="tertiary"
            size="m"
            leftIcon={copyStatus === "copied" ? <CheckIcon /> : <CopyIcon />}
            onClick={copyLink}
            onKeyDown={activationKeyDown(copyLink)}
          >
            {t(COPY_STATUS_KEYS[copyStatus])}
          </Button>
        </div>
      ) : (
        <p className={styles.mutedText}>{joinUrl}</p>
      )}
    </DetailRow>
  );
};

// "7 guests" over the responses given, as calendar apps summarise attendance.
const GuestSummary = ({ event }: { readonly event: CalendarEvent }) => {
  const { t } = useCalendarLocalization();
  const responses = formatRsvpResponses(event, t);

  return (
    <>
      <p className={styles.text}>
        {t("calendar.detail.guests", { count: guestCount(event) })}
      </p>
      {responses === "" ? null : (
        <p className={styles.mutedText}>{responses}</p>
      )}
    </>
  );
};

interface ParticipantsSectionProps {
  readonly event: CalendarEvent;
  /** Lists every guest by response in place of the avatar stack. */
  readonly expanded: boolean;
  readonly onShowAllGuests: () => void;
  readonly participantOverflowCount: number;
  readonly visibleParticipants: readonly CalendarAttendee[];
}

// The stack shows a few faces; +N opens the expanded view, whose guest list has names and
// scrolls on its own, so a lecture-sized invite never fills the popover with avatars.
const ParticipantsSection = ({
  event,
  expanded,
  onShowAllGuests,
  participantOverflowCount,
  visibleParticipants,
}: ParticipantsSectionProps) => {
  const { t } = useCalendarLocalization();

  if (guestCount(event) === 0) {
    return null;
  }

  return (
    <DetailRow icon={<UsersIcon />} label={t("calendar.detail.participants")}>
      <GuestSummary event={event} />
      {expanded ? (
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
    </DetailRow>
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
    <DetailRow icon={<GlobeIcon />} label={t("calendar.detail.timeZone")}>
      {zones.map((zone) => (
        <p key={zone} className={styles.mutedText}>
          {formatZoneLine(event, zone, locale)}
        </p>
      ))}
    </DetailRow>
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

// Expanded with many guests: a column of its own, with no icon so the list keeps one edge.
const InviteeColumn = ({ event }: { readonly event: CalendarEvent }) => {
  const { t } = useCalendarLocalization();

  return (
    <aside
      aria-label={t("calendar.detail.participants")}
      className={styles.sideColumn}
    >
      <div className={styles.rowContent}>
        <GuestSummary event={event} />
        <GuestGroups attendees={event.attendees ?? []} />
      </div>
    </aside>
  );
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

// A few guests fit in the people group; a column of their own would leave most of it empty.
const GUEST_COLUMN_THRESHOLD = 3;

const hasGuestColumn = (event: CalendarEvent): boolean =>
  (event.attendees ?? []).length > GUEST_COLUMN_THRESHOLD;

export interface DefaultDetailProps {
  readonly canCopyJoinLink: boolean;
  /** Lists every guest; with more than three, in a column on the end side. */
  readonly expanded: boolean;
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly copyLink: () => void;
  readonly copyStatus: EventDetailPanelCopyStatus;
  readonly event: CalendarEvent;
  readonly joinUrl: string | undefined;
  /** Opens the expanded view from the avatar stack's +N. */
  readonly onShowAllGuests: () => void;
  readonly participantOverflowCount: number;
  readonly visibleParticipants: readonly CalendarAttendee[];
}

const DetailSections = ({
  canCopyJoinLink,
  comparisonTimeZone,
  copyLink,
  copyStatus,
  event,
  expanded,
  joinUrl,
  onShowAllGuests,
  participantOverflowCount,
  visibleParticipants,
}: DefaultDetailProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();
  const recurrenceSummary = formatRecurrenceSummary(event, t, locale);
  const conflicts = event.conflicts ?? [];
  const location = event.location ?? "";
  const description = event.description ?? "";

  // Groups render even when every row in them is empty; the stylesheet hides empty groups and
  // draws a rule only between groups that have content.
  return (
    <>
      <div className={styles.group}>
        <DetailRow icon={<ClockIcon />} label={t("calendar.detail.dateTime")}>
          <p className={styles.text}>
            {formatEventRange(event, timeZone, locale)}
          </p>
          {recurrenceSummary !== undefined && (
            <p className={styles.mutedText}>{recurrenceSummary}</p>
          )}
        </DetailRow>
        <TimeZoneSection
          comparisonTimeZone={comparisonTimeZone}
          event={event}
        />
        {joinUrl !== undefined && (
          <ConferencingSection
            canCopyJoinLink={canCopyJoinLink}
            copyLink={copyLink}
            copyStatus={copyStatus}
            joinUrl={joinUrl}
          />
        )}
      </div>
      <div className={styles.group}>
        {location !== "" && (
          <DetailRow
            icon={<MapPinIcon />}
            label={t("calendar.detail.location")}
          >
            <p className={styles.text}>{location}</p>
          </DetailRow>
        )}
        {conflicts.length > 0 && (
          <DetailRow
            icon={<TriangleAlertIcon />}
            label={t("calendar.detail.conflicts")}
          >
            <ConflictIndicator
              className={styles.conflicts}
              conflicts={conflicts}
              renderConflict={renderConflictDetail}
            />
          </DetailRow>
        )}
      </div>
      <div className={styles.group}>
        <OrganizerSection event={event} />
        {(!expanded || !hasGuestColumn(event)) && (
          <ParticipantsSection
            event={event}
            expanded={expanded}
            onShowAllGuests={onShowAllGuests}
            participantOverflowCount={participantOverflowCount}
            visibleParticipants={visibleParticipants}
          />
        )}
      </div>
      {description !== "" && (
        <div className={styles.group}>
          <DetailRow
            icon={<TextAlignStartIcon />}
            label={t("calendar.detail.description")}
          >
            <p className={styles.description}>{description}</p>
          </DetailRow>
        </div>
      )}
    </>
  );
};

export const DefaultDetail = (props: DefaultDetailProps) => {
  if (!props.expanded || !hasGuestColumn(props.event)) {
    return <DetailSections {...props} />;
  }

  return (
    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        <DetailSections {...props} />
      </div>
      <InviteeColumn event={props.event} />
    </div>
  );
};
