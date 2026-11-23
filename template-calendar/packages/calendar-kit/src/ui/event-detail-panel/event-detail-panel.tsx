"use client";
// @cpt-flow:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-template-calendar-calendar-kit-dod-week-grid-slots:p1

import { clsx } from "clsx";
import { PencilLineIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { CalendarEvent, IanaTimeZone } from "../../core/model";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type { CalendarContextProps } from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useEventDetailPanelController } from "../../react/controllers/use-event-detail-panel-controller";
import { Button } from "../primitives/button/button";
import { ScrollRegion } from "../primitives/scroll-region/scroll-region";
import { Separator } from "../primitives/separator/separator";
import { Tooltip } from "../primitives/tooltip/tooltip";
import { activationKeyDown } from "./event-detail-activation";
import { resolveCopyAnnouncement } from "./event-detail-panel-format";
import styles from "./event-detail-panel.module.css";
import { DefaultDetail, RestrictedSection } from "./event-detail-sections";

export interface EventDetailPanelProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Controlled open state. */
  readonly open?: boolean;
  /** Initial open state when uncontrolled. */
  readonly defaultOpen?: boolean;
  /** Called when the panel opens or closes. */
  readonly onOpenChange?: (open: boolean) => void;
  /** The event to show. */
  readonly event?: CalendarEvent | null;
  /** Id of the selected event, for host bookkeeping. */
  readonly selectedEventId?: string | null;
  /** Called by the close button and Escape. */
  readonly onClose: () => void;
  /** Shows the edit button. Hidden when `readOnly` or the event is busy. */
  readonly onEdit?: (event: CalendarEvent) => void;
  /** Shows the delete button. Hidden when `readOnly` or the event is busy. */
  readonly onDelete?: (event: CalendarEvent) => void;
  /** Adds a second line with the event time in this zone. */
  readonly comparisonTimeZone?: IanaTimeZone | null;
  /** Hides edit and delete. */
  readonly readOnly?: boolean;
  /** Element that holds the focused opener, for example a node inside a shadow root. */
  readonly container?: Element | DocumentFragment;
  /** Avatars shown before the `+N` control. Default `5`. */
  readonly maxVisibleParticipants?: number;
  /** Content below the header row. */
  readonly renderHeader?: (event: CalendarEvent | null) => ReactNode;
  /** Replaces the whole default body. */
  readonly renderBody?: (event: CalendarEvent) => ReactNode;
  /** Host rows appended to the body. */
  readonly renderMetadata?: (event: CalendarEvent) => ReactNode;
  /** Replaces the edit and delete buttons. */
  readonly renderActions?: (event: CalendarEvent) => ReactNode;
  /** Content below the body, for example RSVP controls. */
  readonly renderFooter?: (event: CalendarEvent) => ReactNode;
}

const isSet = <T,>(value: T | null | undefined): value is NonNullable<T> =>
  (value ?? null) !== null;

interface EventDetailPanelHeaderProps {
  readonly canDelete: boolean;
  readonly canEdit: boolean;
  readonly event: CalendarEvent | null;
  readonly onClose: () => void;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
  readonly renderActions?: (event: CalendarEvent) => ReactNode;
  readonly children: ReactNode;
}

interface HeaderActionProps {
  readonly className?: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onActivate: () => void;
}

// Icon-only, so the tooltip names the control for sighted users; aria-label names it for the rest.
const HeaderAction = ({
  className,
  icon,
  label,
  onActivate,
}: HeaderActionProps) => (
  <Tooltip label={label}>
    <Button
      onlyIcon
      variant="ghost"
      size="l"
      className={clsx(styles.headerAction, className)}
      leftIcon={icon}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={activationKeyDown(onActivate)}
    />
  </Tooltip>
);

const EventDetailPanelHeader = ({
  canDelete,
  canEdit,
  event,
  onClose,
  onDelete,
  onEdit,
  renderActions,
  children,
}: EventDetailPanelHeaderProps) => {
  const { t } = useCalendarLocalization();

  const hostActions =
    event !== null && isSet(renderActions) ? renderActions(event) : null;
  const showEdit = hostActions === null && canEdit;
  const showDelete = hostActions === null && canDelete;

  return (
    <div className={styles.header}>
      {children}
      <div className={styles.headerActions}>
        {hostActions}
        {showEdit && (
          <HeaderAction
            icon={<PencilLineIcon />}
            label={t("calendar.detail.edit")}
            onActivate={onEdit}
          />
        )}
        {showDelete && (
          <HeaderAction
            className={styles.deleteAction}
            icon={<Trash2Icon />}
            label={t("calendar.detail.delete")}
            onActivate={onDelete}
          />
        )}
        {(hostActions !== null || showEdit || showDelete) && (
          <Separator
            decorative
            orientation="vertical"
            className={styles.headerDivider}
          />
        )}
        <HeaderAction
          icon={<XIcon />}
          label={t("calendar.detail.close")}
          onActivate={onClose}
        />
      </div>
    </div>
  );
};

type EventDetailPanelController = ReturnType<
  typeof useEventDetailPanelController
>;

interface EventDetailPanelBodyProps {
  readonly comparisonTimeZone: IanaTimeZone | null;
  readonly controller: EventDetailPanelController;
  readonly event: CalendarEvent;
  readonly onShowAllGuests: () => void;
  readonly renderBody?: (event: CalendarEvent) => ReactNode;
  readonly renderMetadata?: (event: CalendarEvent) => ReactNode;
  readonly showAllGuests: boolean;
}

const EventDetailPanelBody = ({
  comparisonTimeZone,
  controller,
  event,
  onShowAllGuests,
  renderBody,
  renderMetadata,
  showAllGuests,
}: EventDetailPanelBodyProps) => {
  if (controller.isRestricted) {
    return (
      <ScrollRegion className={styles.body}>
        <RestrictedSection event={event} />
      </ScrollRegion>
    );
  }

  return (
    <ScrollRegion className={styles.body}>
      {isSet(renderBody) ? (
        <div className={styles.slot}>{renderBody(event)}</div>
      ) : (
        <DefaultDetail
          canCopyJoinLink={controller.canCopyJoinLink}
          comparisonTimeZone={comparisonTimeZone}
          copyLink={controller.copyLink}
          copyStatus={controller.copyStatus}
          event={event}
          joinUrl={event.joinUrl ?? undefined}
          onShowAllGuests={onShowAllGuests}
          participantOverflowCount={controller.participantOverflowCount}
          showAllGuests={showAllGuests}
          visibleParticipants={controller.visibleParticipants}
        />
      )}
      {isSet(renderMetadata) && (
        <div className={styles.slot}>{renderMetadata(event)}</div>
      )}
    </ScrollRegion>
  );
};

// The copy button shows the result; this region only announces it to screen readers.
const CopyStatus = ({ announcement }: { readonly announcement: string }) =>
  announcement === "" ? null : (
    <p role="status" aria-label={announcement} className={styles.copyStatus}>
      {announcement}
    </p>
  );

const eventTitle = (event: CalendarEvent | null): string | null =>
  event === null || event.title.trim() === "" ? null : event.title;

// Five avatars and the +N chip fit the compact panel's row.
const DEFAULT_VISIBLE_PARTICIPANTS = 5;

type EventDetailPanelContentProps = Omit<
  EventDetailPanelProps,
  keyof CalendarContextProps
>;

const EventDetailPanelContent = (props: EventDetailPanelContentProps) => {
  const { direction, t } = useCalendarLocalization();

  // @cpt-begin:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
  const controller = useEventDetailPanelController({
    ...props,
    maxVisibleParticipants:
      props.maxVisibleParticipants ?? DEFAULT_VISIBLE_PARTICIPANTS,
  });

  const [guestListEventId, setGuestListEventId] = useState<string | null>(null);
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const {
    event,
    comparisonTimeZone = null,
    className,
    renderHeader,
    renderBody,
    renderMetadata,
    renderActions,
    renderFooter,
  } = props;

  const eventValue = event ?? null;
  const eventId = eventValue?.id ?? null;

  useEffect(() => {
    if (controller.isOpen) {
      titleRef.current?.focus();
    }
  }, [controller.isOpen, eventId]);

  if (!controller.isOpen) {
    return null;
  }

  const title = eventTitle(eventValue) ?? t("calendar.detail.title");
  const copyAnnouncement = resolveCopyAnnouncement(controller.copyStatus, t);

  return (
    <section
      aria-labelledby={titleId}
      dir={direction}
      className={clsx(styles.content, className)}
      // Capture, so Escape closes the panel even while a header tooltip is open.
      onKeyDownCapture={(keyboardEvent) => {
        const inListbox =
          keyboardEvent.target instanceof Element &&
          keyboardEvent.target.closest('[role="listbox"]') !== null;

        if (keyboardEvent.key === "Escape" && !inListbox) {
          controller.close();
        }
      }}
    >
      <EventDetailPanelHeader
        canDelete={controller.canDelete}
        canEdit={controller.canEdit}
        event={eventValue}
        onClose={controller.close}
        onDelete={controller.handleDelete}
        onEdit={controller.handleEdit}
        renderActions={controller.isRestricted ? undefined : renderActions}
      >
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className={styles.title}
        >
          {title}
        </h2>
      </EventDetailPanelHeader>
      {isSet(renderHeader) && (
        <div className={styles.headerSlot}>{renderHeader(eventValue)}</div>
      )}
      {eventValue !== null && (
        <EventDetailPanelBody
          comparisonTimeZone={comparisonTimeZone}
          controller={controller}
          event={eventValue}
          onShowAllGuests={() => {
            setGuestListEventId(eventId);
          }}
          renderBody={renderBody}
          renderMetadata={renderMetadata}
          showAllGuests={guestListEventId === eventId}
        />
      )}
      {eventValue !== null && isSet(renderFooter) && (
        <div className={styles.footerSlot}>{renderFooter(eventValue)}</div>
      )}
      <CopyStatus announcement={copyAnnouncement} />
    </section>
  );
  // @cpt-end:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

// The inline region with no frame. A host places it in its own sheet, popover or dialog.
export const EventDetailContent = (props: EventDetailPanelProps) => (
  <CalendarScope {...props}>
    <EventDetailPanelContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

// Kept under the existing name. The kit draws no frame, so both names render the same region.
export const EventDetailPanel = EventDetailContent;
