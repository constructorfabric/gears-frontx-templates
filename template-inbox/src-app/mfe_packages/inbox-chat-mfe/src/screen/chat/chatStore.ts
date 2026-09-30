/**
 * The chat screen's client-side state, kept outside the screen so it
 * survives the screen unmounting: "View contact" and Back, or a trip to
 * another section, return to the same channel, the same open conversation,
 * the same drafts and every change the agent made from the thread. The
 * shell unmounts the screen when another one takes its place, but the
 * package's module graph is evaluated once per page load, so this
 * module-level store is still there when the screen mounts again.
 *
 * Only what is truly client-side lives here. A posted reply or note and a
 * started conversation are the server's (the mock store keeps them, and the
 * next read returns them); the fields the details panel changes, a channel
 * the agent creates, and a draft are the client's own, so they are held here
 * and laid over the fetched collections. The contacts screen's
 * `contactsStore` is the same arrangement.
 */

import { CHANNEL_GENERAL } from '@inbox-shared/api/constants';
import type { Channel, Conversation } from '@inbox-shared/api/types';
import { createStore, useStore } from '@inbox-shared/ui/createStore';
import type { ComposerTab } from './Composer';
import type { SortOrder } from './conversationOrdering';

/**
 * The fields a triaging agent changes from the thread. The service's write
 * surface is one endpoint - posting a reply or a note - so everything else
 * the details panel offers moves a value a real backend would own; it is
 * applied over the fetched conversation rather than pretending to have been
 * saved.
 */
export type ConversationPatch = Partial<
  Pick<Conversation, 'assignee' | 'priority' | 'snoozed' | 'starred' | 'status' | 'tags' | 'teamInbox'>
>;

export type ChatState = {
  channelId: string;
  /**
   * The open conversation, as the screen last had it. The screen owns the
   * live value (its automatic first pick is decided during render, where only
   * the screen's own state may change) and writes it back here, so a later
   * mount opens the same conversation.
   */
  selectedId: string | null;
  /** The channel still owed an automatic first pick (`useAutoSelect`), or `null`. */
  autoSelectOwedTo: string | null;
  search: string;
  sort: SortOrder;
  composerTab: ComposerTab;
  detailsVisible: boolean;
  patches: Readonly<Record<string, ConversationPatch>>;
  /** Unsent text per conversation id. */
  drafts: Readonly<Record<string, string>>;
  /** Channels the agent created this session, never posted anywhere. */
  extraChannels: readonly Channel[];
  /**
   * Conversations the agent started, as the server answered the create. The
   * server keeps them too, so they show up in the next read of the list; until
   * then they are laid over the one the screen holds, never twice.
   */
  extraConversations: readonly Conversation[];
  /** A just-started conversation wants its reply box focused; the composer consumes it once. */
  composerFocusPending: boolean;
};

const initialState = (): ChatState => ({
  channelId: CHANNEL_GENERAL,
  selectedId: null,
  autoSelectOwedTo: CHANNEL_GENERAL,
  search: '',
  sort: 'last-activity',
  composerTab: 'reply',
  detailsVisible: true,
  patches: {},
  drafts: {},
  extraChannels: [],
  extraConversations: [],
  composerFocusPending: false,
});

export const chatStore = createStore(initialState);

export const useChat = <Slice>(select: (state: ChatState) => Slice): Slice => useStore(chatStore, select);

const set = (patch: Partial<ChatState>) => chatStore.update((state) => ({ ...state, ...patch }));

export const chatActions = {
  selectChannel: (channelId: string) => set({ channelId }),
  rememberSelection: (selectedId: string | null, autoSelectOwedTo: string | null) =>
    chatStore.update((state) =>
      state.selectedId === selectedId && state.autoSelectOwedTo === autoSelectOwedTo
        ? state
        : { ...state, selectedId, autoSelectOwedTo }
    ),
  setSearch: (search: string) => set({ search }),
  setSort: (sort: SortOrder) => set({ sort }),
  setComposerTab: (composerTab: ComposerTab) => set({ composerTab }),
  toggleDetails: () => chatStore.update((state) => ({ ...state, detailsVisible: !state.detailsVisible })),

  patchConversation: (conversationId: string, patch: ConversationPatch) =>
    chatStore.update((state) => ({
      ...state,
      patches: { ...state.patches, [conversationId]: { ...state.patches[conversationId], ...patch } },
    })),

  setDraft: (conversationId: string, draft: string) =>
    chatStore.update((state) =>
      state.drafts[conversationId] === draft ? state : { ...state, drafts: { ...state.drafts, [conversationId]: draft } }
    ),

  /** Appended rather than assigned, so a half-typed reply survives a suggestion click. */
  appendToDraft: (conversationId: string, text: string) =>
    chatStore.update((state) => {
      const current = state.drafts[conversationId] ?? '';
      return { ...state, drafts: { ...state.drafts, [conversationId]: current === '' ? text : `${current} ${text}` } };
    }),

  /** Clears a sent draft - only if the box still holds what was sent; text typed meanwhile is a new draft. */
  clearDraftIfSent: (conversationId: string, sentBody: string) =>
    chatStore.update((state) =>
      (state.drafts[conversationId] ?? '').trim() === sentBody
        ? { ...state, drafts: { ...state.drafts, [conversationId]: '' } }
        : state
    ),

  addChannel: (channel: Channel) =>
    chatStore.update((state) => ({
      ...state,
      extraChannels: [...state.extraChannels, channel],
      channelId: channel.id,
    })),

  addConversation: (conversation: Conversation) =>
    chatStore.update((state) => ({
      ...state,
      extraConversations: [...state.extraConversations, conversation],
    })),

  requestComposerFocus: () => set({ composerFocusPending: true }),
  composerFocused: () => set({ composerFocusPending: false }),
};
