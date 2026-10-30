"use client";
// @cpt-flow:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-template-calendar-calendar-kit-dod-week-grid-slots:p1

import { clsx } from "clsx";
import {
  Maximize2Icon,
  Minimize2Icon,
  PencilLineIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
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
import { Dialog, DialogContent } from "../primitives/dialog/dialog";
import { Popover } from "../primitives/popover/popover";
import { Separator } from "../primitives/separator/separator";
import { Tooltip } from "../primitives/tooltip/tooltip";
import { activationKeyDown } from "./event-detail-activation";
import { resolveCopyAnnouncement } from "./event-detail-panel-format";
import { DefaultDetail, RestrictedSection } from "./event-detail-sections";

import styles from "./event-detail-panel.module.css";

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
  /** Called by the close button, Escape and an outside press. */
  readonly onClose: () => void;
  /** Shows the edit button. Hidden when `readOnly` or the event is busy. */
  readonly onEdit?: (event: CalendarEvent) => void;
  /** Shows the delete button. Hidden when `readOnly` or the event is busy. */
  readonly onDelete?: (event: CalendarEvent) => void;
  /** Adds a second line with the event time in this zone. */
  readonly comparisonTimeZone?: IanaTimeZone | null;
  /** Hides edit and delete. */
  readonly readOnly?: boolean;
  /** Portal target for the popover or dialog, for example a node inside a shadow root. */
  readonly container?: Element | DocumentFragment;
  /** Opens the detail as a popover beside this element, usually the card from `onEventSelect`. */
  readonly anchorElement?: HTMLElement | null;
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

// Another card switches the preview instead of dismissing it.
const isEventCard = (target: EventTarget): boolean =>
  target instanceof HTMLElement && target.dataset.eventId !== undefined;

interface EventDetailPanelHeaderProps {
  readonly canDelete: boolean;
  readonly canEdit: boolean;
  readonly event: CalendarEvent | null;
  readonly expanded: boolean;
  readonly onClose: () => void;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
  readonly onToggleExpanded: (() => void) | null;
  readonly renderActions?: (event: CalendarEvent) => ReactNode;
  readonly title: string;
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
      size="m"
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
  expanded,
  onClose,
  onDelete,
  onEdit,
  onToggleExpanded,
  renderActions,
  title,
}: EventDetailPanelHeaderProps) => {
  const { t } = useCalendarLocalization();

  const hostActions =
    event !== null && isSet(renderActions) ? renderActions(event) : null;
  const showEdit = hostActions === null && canEdit;
  const showDelete = hostActions === null && canDelete;

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
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
        {onToggleExpanded !== null && (
          <HeaderAction
            icon={expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            label={t(
              expanded ? "calendar.detail.collapse" : "calendar.detail.expand"
            )}
            onActivate={onToggleExpanded}
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
  readonly expanded: boolean;
  readonly onShowAllGuests: () => void;
  readonly renderBody?: (event: CalendarEvent) => ReactNode;
  readonly renderMetadata?: (event: CalendarEvent) => ReactNode;
}

const EventDetailPanelBody = ({
  comparisonTimeZone,
  controller,
  event,
  expanded,
  onShowAllGuests,
  renderBody,
  renderMetadata,
}: EventDetailPanelBodyProps) => {
  if (controller.isRestricted) {
    return (
      <div className={styles.body}>
        <RestrictedSection event={event} />
      </div>
    );
  }

  return (
    <div className={styles.body}>
      {isSet(renderBody) ? (
        <div className={styles.slot}>{renderBody(event)}</div>
      ) : (
        <DefaultDetail
          canCopyJoinLink={controller.canCopyJoinLink}
          comparisonTimeZone={comparisonTimeZone}
          copyLink={controller.copyLink}
          copyStatus={controller.copyStatus}
          event={event}
          expanded={expanded}
          joinUrl={event.joinUrl ?? undefined}
          onShowAllGuests={onShowAllGuests}
          participantOverflowCount={controller.participantOverflowCount}
          visibleParticipants={controller.visibleParticipants}
        />
      )}
      {isSet(renderMetadata) && (
        <div className={styles.slot}>{renderMetadata(event)}</div>
      )}
    </div>
  );
};

// The copy button shows the result; this region only announces it to screen readers.
const CopyStatus = ({ announcement }: { readonly announcement: string }) =>
  announcement === "" ? null : (
    <p role="status" aria-label={announcement} className={styles.copyStatus}>
      {announcement}
    </p>
  );

// Without an anchor there is only the dialog. A restricted event has nothing more to show, so it
// never expands.
const expansion = (
  anchored: boolean,
  restricted: boolean,
  expandedHere: boolean
) => {
  const canExpand = anchored && !restricted;

  return { canExpand, expanded: !anchored || (canExpand && expandedHere) };
};

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

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const {
    event,
    comparisonTimeZone = null,
    anchorElement = null,
    className,
    container,
    renderHeader,
    renderBody,
    renderMetadata,
    renderActions,
    renderFooter,
  } = props;

  const eventValue = event ?? null;
  const eventId = eventValue?.id ?? null;

  if (!controller.isOpen) {
    return null;
  }

  const title =
    eventValue !== null && eventValue.title.trim() !== ""
      ? eventValue.title
      : t("calendar.detail.title");

  const copyAnnouncement = resolveCopyAnnouncement(controller.copyStatus, t);
  const { canExpand, expanded } = expansion(
    anchorElement !== null,
    controller.isRestricted,
    expandedEventId === eventId
  );

  const close = (): void => {
    controller.close();
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      controller.close();
    }
  };

  const content = (
    <div dir={direction} className={styles.content}>
      <EventDetailPanelHeader
        canDelete={controller.canDelete}
        canEdit={controller.canEdit}
        event={eventValue}
        expanded={expanded}
        onClose={close}
        onDelete={controller.handleDelete}
        onEdit={controller.handleEdit}
        onToggleExpanded={
          canExpand
            ? () => {
                setExpandedEventId(expanded ? null : eventId);
              }
            : null
        }
        renderActions={controller.isRestricted ? undefined : renderActions}
        title={title}
      />
      {isSet(renderHeader) && (
        <div className={styles.headerSlot}>{renderHeader(eventValue)}</div>
      )}
      {eventValue !== null && (
        <EventDetailPanelBody
          comparisonTimeZone={comparisonTimeZone}
          controller={controller}
          event={eventValue}
          expanded={expanded}
          onShowAllGuests={() => {
            setExpandedEventId(eventId);
          }}
          renderBody={renderBody}
          renderMetadata={renderMetadata}
        />
      )}
      {eventValue !== null && isSet(renderFooter) && (
        <div className={styles.footerSlot}>{renderFooter(eventValue)}</div>
      )}
      <CopyStatus announcement={copyAnnouncement} />
    </div>
  );

  if (!expanded && anchorElement !== null) {
    return (
      <Popover
        open
        onOpenChange={handleOpenChange}
        anchorRect={anchorElement.getBoundingClientRect()}
        anchorRectProvider={() => anchorElement.getBoundingClientRect()}
        anchorElement={anchorElement}
        belongsTo={isEventCard}
        placement="inline"
        label={title}
        container={container}
        className={clsx(styles.popover, className)}
      >
        {content}
      </Popover>
    );
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        container={container}
        dir={direction}
        label={title}
        showCloseButton={false}
        className={clsx(styles.expanded, className)}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
  // @cpt-end:cpt-template-calendar-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-slots
};

export const EventDetailPanel = (props: EventDetailPanelProps) => (
  <CalendarScope {...props}>
    <EventDetailPanelContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);
