import { Fragment, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  AlarmClockIcon,
  ArrowLeftIcon,
  CheckCheckIcon,
  CheckIcon,
  CircleAlertIcon,
  FileIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PanelRightIcon,
  StarIcon,
  TicketIcon,
  UserMinusIcon,
} from 'lucide-react';
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  Bubble,
  BubbleContent,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Marker,
  MarkerContent,
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  Toggle,
  useMessageScroller,
  useMessageScrollerScrollable,
} from '@gears-frontx/ui-kit';
import type {
  AgentIdentity,
  Contact,
  Conversation,
  Message as ThreadMessage,
  MessageLink,
} from '../../api/types';
import { cx } from '../../shared/cx';
import { labelOf, messageDayKey, messageDayLabel, messageTimeOfDay } from '../../shared/format';
import type { Translate } from '../../shared/i18n';
import { PresenceAvatar } from '../../shared/PresenceAvatar';
import { Composer, type ComposerProps } from './Composer';
import sharedStyles from '../../shared/shared.module.css';
import styles from './inbox.module.css';

/**
 * Three bubble roles, spelled out rather than nested in the markup: an
 * internal note is quiet on purpose, the agent's own messages carry the
 * primary fill, and the customer's carry the neutral one.
 */
const bubbleVariantFor = (message: ThreadMessage): 'muted' | 'default' | 'secondary' => {
  if (message.internal) return 'muted';
  return message.direction === 'outbound' ? 'default' : 'secondary';
};

/** The schemes a message link may open; anything else renders as plain text. */
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Whether `href` is an absolute URL with a scheme the thread is willing to
 * open. A `javascript:` or `data:` href from a message body would run or load
 * content in the app's own origin, and a relative one points into the app
 * rather than at the resource the sender meant.
 */
export const isSafeLinkHref = (href: string): boolean => {
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
};

/**
 * Splits `body` on each `link.text` occurrence (in the order the links are
 * listed) and renders that substring as an anchor - never markdown, never
 * `dangerouslySetInnerHTML`, so a message cannot add markup to its text. The
 * href is the other half of that: only an http, https or mailto URL becomes
 * an anchor (`isSafeLinkHref`); any other link keeps its text as plain text.
 * A link whose `text` is not actually found in `body` (a dataset mistake) is
 * skipped rather than thrown - the rest of the message still renders.
 */
function renderMessageBody(body: string, links: MessageLink[]): ReactNode {
  if (links.length === 0) return body;
  let remaining = body;
  const nodes: ReactNode[] = [];
  links.forEach((link, index) => {
    const at = remaining.indexOf(link.text);
    if (at === -1) return;
    if (at > 0) nodes.push(remaining.slice(0, at));
    if (!isSafeLinkHref(link.href)) {
      nodes.push(link.text);
      remaining = remaining.slice(at + link.text.length);
      return;
    }
    nodes.push(
      <a
        key={`link-${index}`}
        className={styles.bubbleLink}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {link.text}
      </a>
    );
    remaining = remaining.slice(at + link.text.length);
  });
  nodes.push(remaining);
  return nodes;
}

/**
 * The in-bubble timestamp, inside the bubble it dates. Outbound-only read
 * receipts: a single check for delivered-not-read, a filled double check for
 * read, nothing while there is no receipt (`seen: null`).
 */
function MessageMeta({
  message,
  t,
  className,
}: {
  message: ThreadMessage;
  t: Translate;
  className?: string;
}) {
  return (
    <span className={cx(styles.bubbleMeta, className)}>
      <span className={styles.bubbleMetaTime}>{messageTimeOfDay(message.sentAt)}</span>
      {message.direction === 'outbound' && message.seen !== null ? (
        message.seen ? (
          <CheckCheckIcon className={styles.readTick} role="img" aria-label={t('message_read')} />
        ) : (
          <CheckIcon className={styles.deliveredTick} role="img" aria-label={t('message_delivered')} />
        )
      ) : null}
    </span>
  );
}

/**
 * The jump-to-newest affordance only makes sense while there is content below
 * the fold, and the hook that knows must run under the provider - hence a
 * component of its own rather than a branch in the parent.
 */
function ScrollToNewest({ label }: { label: string }) {
  const { end } = useMessageScrollerScrollable();
  return end ? <MessageScrollerButton direction="end" aria-label={label} /> : null;
}

/**
 * Renders no DOM of its own - it exists purely to call the primitive's
 * imperative `scrollToEnd` at the right moment. The kit's message scroller
 * primitive has a content-diff heuristic (`handleContentChange`) that aligns a single newly
 * appended `scrollAnchor` item to the viewport's START, not its end -
 * that alignment is what it uses whenever exactly one new message shows
 * up, `autoScroll` or not (its own multi-anchor fast path never applies
 * to a single append), and it pads a real, non-zero
 * `[data-message-scroller-spacer]` under that message so the alignment
 * is reachable. Explicitly following to the end on every new message
 * bypasses that heuristic and gives the thread the follow-the-newest
 * behavior every chat app has.
 */
function FollowNewestMessage({ lastMessageId }: { lastMessageId: string | undefined }) {
  const { scrollToEnd } = useMessageScroller();
  const previousLastMessageId = useRef(lastMessageId);
  useEffect(() => {
    if (lastMessageId === undefined || lastMessageId === previousLastMessageId.current) {
      previousLastMessageId.current = lastMessageId;
      return;
    }
    previousLastMessageId.current = lastMessageId;
    // Runs after the primitive's own MutationObserver-driven
    // handleContentChange (which fires as soon as the new item lands in
    // the DOM and jumps/pads for its own align:'start' heuristic - see
    // the comment above): two rAFs land after that adjustment's own
    // paint, so this call is the LAST word on scroll position rather than
    // one the primitive's reaction can still clobber.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        scrollToEnd({ behavior: 'smooth' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [lastMessageId, scrollToEnd]);
  return null;
}

export type ConversationThreadProps = {
  conversation: Conversation;
  contact: Contact | undefined;
  agent: AgentIdentity | undefined;
  messages: ThreadMessage[];
  detailsVisible: boolean;
  onToggleDetails: () => void;
  onToggleStar: () => void;
  onToggleSnooze: () => void;
  /** Marks the conversation as spam, or takes the mark off. */
  onToggleSpam: () => void;
  isSpam: boolean;
  onCloseConversation: () => void;
  onBack: (() => void) | null;
  /** Puts the chip's text in the composer; the chip row is what calls it. */
  onUseSuggestedReply: (reply: string) => void;
  composer: ComposerProps;
  t: Translate;
};

export function ConversationThread({
  conversation,
  contact,
  agent,
  messages,
  detailsVisible,
  onToggleDetails,
  onToggleStar,
  onToggleSnooze,
  onToggleSpam,
  isSpam,
  onCloseConversation,
  onBack,
  onUseSuggestedReply,
  composer,
  t,
}: ConversationThreadProps) {
  const contactName = contact?.name ?? conversation.subject;
  const suggestions = conversation.suggestedReplies;

  return (
    <div className={sharedStyles.thread}>
      <div className={sharedStyles.threadHeader}>
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeftIcon />}
            aria-label={t('back_to_list')}
            onClick={onBack}
          />
        ) : null}
        <PresenceAvatar
          name={contactName}
          presence={contact?.presence ?? 'offline'}
          size="lg"
          t={t}
        />
        <div className={sharedStyles.threadTitles}>
          <span className={sharedStyles.threadSubject}>{conversation.subject}</span>
          <span className={sharedStyles.threadSubtitle}>
            {t('contact_presence', { name: contactName, presence: labelOf(contact?.presence ?? 'offline', t) })}
          </span>
        </div>
        <span className={sharedStyles.spacer} />
        <div className={sharedStyles.threadActions}>
          {/* Two-state controls, so the kit's Toggle: the pressed state says
              whether the conversation is starred or snoozed, and the label
              names the control rather than the action it would take next. */}
          <Toggle
            size="sm"
            iconOnly
            aria-label={t('star_conversation')}
            pressed={conversation.starred}
            onPressedChange={onToggleStar}
          >
            <StarIcon />
          </Toggle>
          <Toggle
            size="sm"
            iconOnly
            aria-label={t('snooze_conversation')}
            pressed={conversation.snoozed}
            onPressedChange={onToggleSnooze}
          >
            <AlarmClockIcon />
          </Toggle>
          {/*
            Create-ticket and Unassign render disabled, the app's convention
            for a control whose action this template does not ship: Tickets is
            a section the template leaves out, and unassigning is a routing
            change the details panel already owns through its Assignee select.
            Mark as spam is live - it is the same toggle as the details
            panel's spam button.
          */}
          <Button
            variant="ghost"
            size="sm"
            icon={<TicketIcon />}
            aria-label={t('create_ticket')}
            disabled
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" icon={<MoreHorizontalIcon />} aria-label={t('more_actions')} />
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>
                <UserMinusIcon />
                {t('unassign')}
              </DropdownMenuItem>
              <DropdownMenuItem variant={isSpam ? 'default' : 'destructive'} onClick={onToggleSpam}>
                <CircleAlertIcon />
                {isSpam ? t('remove_from_spam') : t('mark_as_spam')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            icon={<PanelRightIcon />}
            aria-label={t('toggle_details')}
            aria-pressed={detailsVisible}
            onClick={onToggleDetails}
          />
          <Button
            variant="ghost"
            size="sm"
            className={styles.closeButton}
            disabled={conversation.status === 'closed'}
            onClick={onCloseConversation}
          >
            {conversation.status === 'closed' ? t('closed') : t('close')}
          </Button>
        </div>
      </div>

      {/*
        Keyed by conversation id: MessageScrollerProvider/MessageScroller
        hold the primitive's own scroll-anchor/spacer state in refs that
        never reset on their own (see message-scroller.md's anti-patterns).
        Without this key, switching conversations keeps the SAME provider
        instance mounted and swaps its messages prop for a different
        conversation's list; the primitive reads that as an in-place
        edit to the CURRENT transcript (messages appended/removed) rather
        than "this is a different transcript, start over", so it tries to
        anchor the read position to whatever used to be the previous
        item count - which can leave a large, real, non-zero
        [data-message-scroller-spacer] between the last message and the
        composer. The `key` forces React to fully unmount and remount the
        subtree per conversation, giving the primitive a genuine fresh
        mount (and its own scrollToEnd-on-load) every time.

        `autoScroll`: makes `scrollToEnd` (called by `FollowNewestMessage`
        below) put the primitive into its own "following-bottom" mode -
        without it, jumping to the end still works once, but the jump-to-
        newest button and the scrollable-edge state it reads don't know
        the reader is now caught up.

        `FollowNewestMessage`: the primitive's own content-diff heuristic
        aligns a single newly appended `scrollAnchor` item to the
        viewport's START, not its end - a single append never takes its
        multi-anchor "follow to end" fast path, `autoScroll` or not - and
        pads a real, non-zero [data-message-scroller-spacer] under that
        message so the alignment is reachable. That reproduces the same
        "hole before the composer" symptom on every send. Explicitly
        following to the end whenever the newest message id changes
        bypasses that heuristic and gives the thread the follow-the-newest
        behavior every chat app has.
      */}
      <MessageScrollerProvider key={conversation.id} autoScroll>
        <FollowNewestMessage lastMessageId={messages[messages.length - 1]?.id} />
        <MessageScroller className={sharedStyles.transcript}>
          <MessageScrollerViewport>
            <MessageScrollerContent className={styles.transcriptContent}>
              {messages.map((message, index) => {
                const outbound = message.direction === 'outbound';
                const senderName = outbound ? (agent?.name ?? '') : contactName;
                const previous = index > 0 ? messages[index - 1] : null;
                const showDivider =
                  previous === null || messageDayKey(previous.sentAt) !== messageDayKey(message.sentAt);
                return (
                  <Fragment key={message.id}>
                    {showDivider ? (
                      <Marker variant="separator">
                        <MarkerContent>{messageDayLabel(message.sentAt)}</MarkerContent>
                      </Marker>
                    ) : null}
                    <MessageScrollerItem
                      messageId={message.id}
                      scrollAnchor={index === messages.length - 1}
                    >
                      <Message align={outbound ? 'end' : 'start'}>
                        <MessageAvatar>
                          <PresenceAvatar
                            name={senderName}
                            presence={
                              outbound ? (agent?.presence ?? 'online') : (contact?.presence ?? 'offline')
                            }
                            size="sm"
                            t={t}
                          />
                        </MessageAvatar>
                        <MessageContent>
                          {message.internal ? (
                            <MessageHeader>{t('internal_note')}</MessageHeader>
                          ) : null}
                          {/*
                            Every kind shares ONE Bubble, framed the same way as a
                            plain-text message of that direction (same background
                            token, same corner radius including the avatar-side
                            tail, same padding) - `.bubbleText` carries that parity
                            on every BubbleContent below, not just the plain-text
                            one. Only what goes INSIDE differs: text, an inset
                            image, or attachment card(s), all inside the bubble.
                          */}
                          {message.kind === 'file' ? (
                            <Bubble className={styles.bubble} align={outbound ? 'end' : 'start'} variant={bubbleVariantFor(message)}>
                              <BubbleContent className={styles.bubbleText}>
                                {message.attachments.map((file, fileIndex) => (
                                  <Attachment key={`${fileIndex}-${file.name}`} className={styles.attachmentSlot}>
                                    <AttachmentMedia>
                                      <FileIcon />
                                    </AttachmentMedia>
                                    <AttachmentContent>
                                      <AttachmentTitle>{file.name}</AttachmentTitle>
                                      <AttachmentDescription>{file.size}</AttachmentDescription>
                                    </AttachmentContent>
                                  </Attachment>
                                ))}
                                <MessageMeta message={message} t={t} />
                              </BubbleContent>
                            </Bubble>
                          ) : message.kind === 'image' ? (
                            <Bubble className={styles.bubble} align={outbound ? 'end' : 'start'} variant={bubbleVariantFor(message)}>
                              <BubbleContent className={cx(styles.bubbleText, styles.imageBubbleContent)}>
                                {message.body ? (
                                  <>
                                    {message.imageUrl === null ? null : (
                                      <img
                                        src={message.imageUrl}
                                        // The caption right below already says it; repeating it as
                                        // alt text would read it twice.
                                        alt=""
                                        className={cx(styles.messageImageInset, styles.messageImageHasCaption)}
                                      />
                                    )}
                                    {/* Meta trails the caption inline (same technique as the
                                        plain-text bubble below) - only reached for a captioned
                                        image, since it needs the caption's own text flow to
                                        trail into. */}
                                    <span className={styles.imageCaptionRow}>
                                      {message.body}
                                      <MessageMeta message={message} t={t} />
                                    </span>
                                  </>
                                ) : (
                                  // No caption: nothing for the meta to trail into, so it
                                  // overlays the image's own bottom-right corner instead.
                                  <span className={styles.imageFrame}>
                                    {message.imageUrl === null ? null : (
                                      <img
                                        src={message.imageUrl}
                                        alt={t('shared_image')}
                                        className={styles.messageImageInset}
                                      />
                                    )}
                                    <MessageMeta
                                      message={message}
                                      t={t}
                                      className={styles.imageMetaOverlay}
                                    />
                                  </span>
                                )}
                              </BubbleContent>
                            </Bubble>
                          ) : (
                            <Bubble
                              className={styles.bubble}
                              align={outbound ? 'end' : 'start'}
                              variant={bubbleVariantFor(message)}
                            >
                              <BubbleContent className={styles.bubbleText}>
                                {/* A `text`-kind message can still carry files alongside its
                                    own body - distinct from `kind: 'file'` above, which IS the
                                    attachment(s). They sit inside the same bubble. */}
                                {message.attachments.map((file, fileIndex) => (
                                  <Attachment key={`${fileIndex}-${file.name}`} className={styles.attachmentSlot}>
                                    <AttachmentMedia>
                                      <PaperclipIcon />
                                    </AttachmentMedia>
                                    <AttachmentContent>
                                      <AttachmentTitle>{file.name}</AttachmentTitle>
                                      <AttachmentDescription>{file.size}</AttachmentDescription>
                                    </AttachmentContent>
                                  </Attachment>
                                ))}
                                {renderMessageBody(message.body, message.links)}
                                <MessageMeta message={message} t={t} />
                              </BubbleContent>
                            </Bubble>
                          )}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  </Fragment>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <ScrollToNewest label={t('scroll_to_newest')} />
        </MessageScroller>
      </MessageScrollerProvider>

      {/*
        The assistant's drafts sit between the transcript and the composer, as
        the last thing read before the reply is written. An empty list renders
        nothing at all rather than an empty row, so a spam or parked thread
        keeps the transcript flush against the composer.
      */}
      {suggestions.length > 0 ? (
        <div className={styles.suggestions} aria-label={t('suggested_replies')} role="group">
          {suggestions.map((reply, replyIndex) => (
            <Button
              key={`${replyIndex}-${reply}`}
              className={styles.suggestionChip}
              variant="outline"
              size="sm"
              onClick={() => onUseSuggestedReply(reply)}
            >
              {reply}
            </Button>
          ))}
        </div>
      ) : null}

      <Composer {...composer} />
    </div>
  );
}
