/**
 * The mock backend's state, one object per page for every inbox screen.
 *
 * Each screen is its own microfrontend, and every MFE load evaluates its own
 * copy of every module it bundles, this folder included. A module-level
 * `let state` would therefore exist once per screen: a reply posted in chat
 * would never reach the contact's activity in contacts. The state lives on
 * `globalThis` instead, under a registry symbol (`Symbol.for`), which every
 * module graph in the page resolves to the same key. The MFE loader evaluates
 * packages in the page's own realm, so they all see one object; FrontX
 * routing keeps its single navigation history the same way.
 *
 * The object is created lazily from the seed by whichever screen reads it
 * first, and never serialized: factories answer with clones
 * (`readInboxMockState` hands out the live object only to the mock maps,
 * which clone on the way out). `revision` counts accepted writes, so a screen
 * whose query cache was filled before another screen wrote knows to drop it
 * (`queries.ts`, `setQueryCacheEpoch`). A page reload starts over from the
 * seed.
 */

import { contacts as seedContacts, conversations as seedConversations, messages as seedMessages } from './dataset';
import type { Contact, Conversation, Message } from './types';

/** The registry key every inbox package shares. Bump the suffix when the state's shape changes. */
export const INBOX_MOCK_STATE_KEY = Symbol.for('@gears-frontx/frontx-template-inbox/mock-state/v1');

/**
 * Names the seed this build carries. The packages ship together from one
 * template version, so two packages disagreeing here means one of them was
 * rebuilt from other sources; the first reader's state wins and the other
 * says so in the console instead of silently mixing datasets.
 */
export const INBOX_SEED_VERSION = '2026-09-30';

export type InboxMockState = {
  readonly seedVersion: string;
  /** Incremented on every accepted write. */
  revision: number;
  /**
   * The people every screen refers to: the contacts directory lists them, and
   * the dashboard's activity rows and the conversations point at them by id.
   * Held here, not read from each package's bundled seed, so every screen
   * answers from one list of people.
   */
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  /** Server-side id sequences for what this page created. */
  postedMessageCount: number;
  createdConversationCount: number;
};

type Realm = typeof globalThis & { [INBOX_MOCK_STATE_KEY]?: InboxMockState };

const realm = (): Realm => globalThis as Realm;

const createInboxMockState = (): InboxMockState => ({
  seedVersion: INBOX_SEED_VERSION,
  revision: 0,
  contacts: structuredClone(seedContacts),
  conversations: structuredClone(seedConversations),
  messages: structuredClone(seedMessages),
  postedMessageCount: 0,
  createdConversationCount: 0,
});

let reportedSeedMismatch = false;

/** The page's mock state, created from this build's seed if no screen has read it yet. */
export function readInboxMockState(): InboxMockState {
  const page = realm();
  const existing = page[INBOX_MOCK_STATE_KEY];
  if (existing === undefined) {
    const created = createInboxMockState();
    page[INBOX_MOCK_STATE_KEY] = created;
    return created;
  }
  if (existing.seedVersion !== INBOX_SEED_VERSION && !reportedSeedMismatch) {
    reportedSeedMismatch = true;
    console.warn(
      `[inbox] The mock state was seeded by ${existing.seedVersion}, this screen carries ${INBOX_SEED_VERSION}; using the existing state.`
    );
  }
  return existing;
}

/** The number of writes the page's mock backend accepted so far. */
export const inboxMockRevision = (): number => realm()[INBOX_MOCK_STATE_KEY]?.revision ?? 0;

/** Records an accepted write. Called by the mock maps once a write has changed the state. */
export const bumpInboxMockRevision = (state: InboxMockState): void => {
  state.revision += 1;
};

/** Back to the seed and fresh id sequences, for every screen in the page. For tests, between cases. */
export const resetInboxMockState = (): void => {
  Reflect.deleteProperty(realm(), INBOX_MOCK_STATE_KEY);
  reportedSeedMismatch = false;
};
