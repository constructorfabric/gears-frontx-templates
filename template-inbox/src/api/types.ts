/**
 * Inbox domain - API response contracts.
 *
 * Every shape here crosses the mock boundary as JSON, so no field carries a
 * `Date`, a `Map`, or a method: `RestMockPlugin` short-circuits the request
 * with the factory's return value verbatim, and a real backend behind the same
 * service would deliver these as parsed JSON.
 *
 * The collection responses are deliberately whole-collection rather than
 * per-id: a mock factory is handed the request body and nothing else, so it
 * cannot tell which id a path named. Selection is therefore a client-side
 * concern in every screen: list search filters live and counters recompute
 * without a round trip.
 */

/** Presence is an identity-independent live state; it drives the avatar badge. */
export type Presence = 'online' | 'offline' | 'away';

export type ConversationPriority = 'none' | 'low' | 'medium' | 'high';

export type ConversationStatus = 'open' | 'snoozed' | 'closed';

export type ConversationChannel = 'chat' | 'email';

export type ContactType = 'user' | 'lead';

export type MessageDirection = 'inbound' | 'outbound';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TicketStatus = 'open' | 'pending' | 'closed';

/** The single seeded agent identity: sender of every outbound message. */
export type AgentIdentity = {
  id: string;
  name: string;
  presence: Presence;
  workspace: string;
};

export type Channel = {
  id: string;
  label: string;
  /** An icon name the channel sidebar maps to a lucide component. */
  icon: 'hash';
  itemCount: number;
  openCount: number;
};

export type SharedFile = {
  name: string;
  /** Human-readable size, as rendered (e.g. "92 KB"). */
  size: string;
};

export type Conversation = {
  id: string;
  channelId: string;
  subject: string;
  contactId: string;
  /** Last message body, truncated by the list row's own line clamp. */
  snippet: string;
  /** ISO instant, resolved from a load-time anchor so "1h" stays plausible. */
  lastActivityAt: string;
  unreadCount: number;
  priority: ConversationPriority;
  status: ConversationStatus;
  /** Empty string means unassigned; the details panel renders that label. */
  assignee: string;
  teamInbox: string;
  channel: ConversationChannel;
  brand: string;
  tags: string[];
  sharedFiles: SharedFile[];
  /**
   * Replies the assistant offers as chips above the composer. Empty is a
   * meaningful value, not a gap: a spam thread is never worth answering, and a
   * snoozed one is parked rather than waiting on the agent, so neither carries
   * a suggestion and the chip row does not render at all.
   */
  suggestedReplies: string[];
  starred: boolean;
  snoozed: boolean;
  /** Pins the conversation to its own group at the top of the channel's
   * list, ahead of every unpinned row regardless of sort order. */
  pinned: boolean;
};

export type MessageAttachment = SharedFile;

/**
 * What a message's own surface renders: `text` inside a framed Bubble
 * (optionally with `links`), `image` unframed with an optional caption, and
 * `file` as a bare attachment card with no bubble at all. Orthogonal to
 * `attachment`, which a `text` message can still carry alongside its body
 * (a reply with a file mentioned in the same breath) - `kind` picks the
 * message's own shape, `attachment` is content any shape but `image` can
 * carry.
 */
export type MessageKind = 'text' | 'image' | 'file';

/**
 * An inline link inside a `text` message's `body`. `text` must be an exact
 * substring of `body`; the renderer splits on it rather than parsing
 * markdown or HTML, so a message can never inject markup it did not
 * already own as plain text.
 */
export type MessageLink = {
  text: string;
  /** An absolute http, https or mailto URL; the thread renders any other href as plain text. */
  href: string;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  kind: MessageKind;
  /**
   * `text`: the message itself. `image`: an optional caption, rendered
   * below the image. `file`: unused (the attachment card carries its own
   * name/size) - kept as `''` rather than optional, so every message has a
   * `body` and call sites never need an extra branch to read it.
   */
  body: string;
  /** Inline links inside `body`; always `[]` outside `kind: 'text'`. */
  links: MessageLink[];
  /** The image to render; only meaningful for `kind: 'image'`. */
  imageUrl: string | null;
  /**
   * Calendar text in the transcript's format ("Aug 21, 2026 - 8:21 AM"),
   * rendered as it arrives. Unlike the list's relative times the transcript
   * shows calendar text, so the server states the text it wants displayed;
   * the seed data derives it from its anchor (`seedClock.ts`), and the date
   * half is what the thread groups its day dividers by.
   */
  timestamp: string;
  /**
   * Read receipt: `true` read, `false` delivered and not yet read, `null` no
   * receipt at all - every inbound message, every internal note, and an
   * outbound reply nothing has been delivered for yet.
   */
  seen: boolean | null;
  /**
   * An internal note, written on the composer's Note tab and never delivered
   * to the customer. It shares the transcript with real messages, so it is a
   * field on the message rather than a separate collection - which is also
   * what lets the thread render the two differently in one pass.
   */
  internal: boolean;
  /**
   * Files carried by this message - `[]` for most messages, one entry for
   * the common "here's a file" case, and more than one for a message that
   * shares several files at once (each renders its own card). One shape
   * for both rather than a singular `attachment` field plus a plural one
   * for "several": a reader of `kind: 'file'` or a `text` message that
   * happens to mention a file never has to check which field is set.
   */
  attachments: MessageAttachment[];
};

export type ContactTicket = {
  id: string;
  number: string;
  subject: string;
  /** ISO instant, resolved from the same load-time anchor. */
  openedAt: string;
  priority: TicketPriority;
  status: TicketStatus;
};

/**
 * A conversation the contact took part in, by id only. The subject, the
 * channel and the time come from the conversation itself, joined on the
 * client, so a contact page can never show a thread that disagrees with the
 * inbox - and a ref whose conversation the client does not hold is skipped
 * rather than rendered from stale copies.
 */
export type ContactConversationRef = {
  id: string;
};

export type Contact = {
  id: string;
  name: string;
  email: string;
  type: ContactType;
  /** Empty string renders as "-", the app's missing-value dash. */
  company: string;
  jobTitle: string;
  phone: string;
  location: string;
  presence: Presence;
  notes: string;
  tags: string[];
  /**
   * ISO instants, resolved from the same load-time anchor. `signedUpAt` is the
   * empty string for a lead, who by definition never signed up; the detail
   * page renders that row as "-" like any other missing value.
   */
  signedUpAt: string;
  addedAt: string;
  lastSeenAt: string;
  /** Sidebar filter membership; the seed data counts 26 active, 8 new. */
  active: boolean;
  isNew: boolean;
  tickets: ContactTicket[];
  conversations: ContactConversationRef[];
};

export type GetAgentResponse = { agent: AgentIdentity };
export type GetChannelsResponse = { channels: Channel[] };
export type GetConversationsResponse = { conversations: Conversation[] };
export type GetMessagesResponse = { messages: Message[] };
export type GetContactsResponse = { contacts: Contact[] };

export type PostMessageRequest = {
  conversationId: string;
  body: string;
  /** A note is internal: it is never shown to the customer. */
  kind: 'reply' | 'note';
};

export type PostMessageResponse = { message: Message };
