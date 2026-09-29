/**
 * The chat screen's client-side state, kept outside the screen so it
 * survives the screen unmounting: "View contact" and Back, or a trip to
 * another section, return to the same channel, the same open conversation,
 * the same drafts and every change the agent made from the thread.
 *
 * Only what is truly client-side lives here. A posted reply or note is the
 * server's (the mock store keeps it, and the next read of the transcript
 * returns it); the fields the details panel changes, a channel or a chat the
 * agent creates, and a draft are the client's own, so they are held here and
 * laid over the fetched collections.
 */

import { CHANNEL_GENERAL } from '../../api/constants';
import type { Channel, Conversation } from '../../api/types';
import { createStore, useStore } from '../../shared/createStore';
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

export type InboxState = {
  channelId: string;
  /**
   * The open conversation, as the screen last had it. The screen owns the
   * live value (its automatic first pick is decided during render, where only
   * the screen's own state may change) and writes it back here, so a later
   * mount opens the same conversation.
   */
  selectedId: string | null;
  search: string;
  sort: SortOrder;
  composerTab: ComposerTab;
  detailsVisible: boolean;
  patches: Readonly<Record<string, ConversationPatch>>;
  /** Unsent text per conversation id. */
  drafts: Readonly<Record<string, string>>;
  /** Channels and chats the agent created this session, never posted anywhere. */
  extraChannels: readonly Channel[];
  extraConversations: readonly Conversation[];
};

const initialState = (): InboxState => ({
  channelId: CHANNEL_GENERAL,
  selectedId: null,
  search: '',
  sort: 'last-activity',
  composerTab: 'reply',
  detailsVisible: true,
  patches: {},
  drafts: {},
  extraChannels: [],
  extraConversations: [],
});

export const inboxStore = createStore(initialState);

export const useInbox = <Slice>(select: (state: InboxState) => Slice): Slice => useStore(inboxStore, select);

const set = (patch: Partial<InboxState>) => inboxStore.update((state) => ({ ...state, ...patch }));

export const inboxActions = {
  selectChannel: (channelId: string) => set({ channelId }),
  rememberSelection: (selectedId: string | null) => set({ selectedId }),
  setSearch: (search: string) => set({ search }),
  setSort: (sort: SortOrder) => set({ sort }),
  setComposerTab: (composerTab: ComposerTab) => set({ composerTab }),
  toggleDetails: () => inboxStore.update((state) => ({ ...state, detailsVisible: !state.detailsVisible })),

  patchConversation: (conversationId: string, patch: ConversationPatch) =>
    inboxStore.update((state) => ({
      ...state,
      patches: { ...state.patches, [conversationId]: { ...state.patches[conversationId], ...patch } },
    })),

  setDraft: (conversationId: string, draft: string) =>
    inboxStore.update((state) =>
      state.drafts[conversationId] === draft ? state : { ...state, drafts: { ...state.drafts, [conversationId]: draft } }
    ),

  /** Appended rather than assigned, so a half-typed reply survives a suggestion click. */
  appendToDraft: (conversationId: string, text: string) =>
    inboxStore.update((state) => {
      const current = state.drafts[conversationId] ?? '';
      return { ...state, drafts: { ...state.drafts, [conversationId]: current === '' ? text : `${current} ${text}` } };
    }),

  /** Clears a sent draft - only if the box still holds what was sent; text typed meanwhile is a new draft. */
  clearDraftIfSent: (conversationId: string, sentBody: string) =>
    inboxStore.update((state) =>
      (state.drafts[conversationId] ?? '').trim() === sentBody
        ? { ...state, drafts: { ...state.drafts, [conversationId]: '' } }
        : state
    ),

  addChannel: (channel: Channel) =>
    inboxStore.update((state) => ({
      ...state,
      extraChannels: [...state.extraChannels, channel],
      channelId: channel.id,
    })),

  addConversation: (conversation: Conversation) =>
    inboxStore.update((state) => ({
      ...state,
      extraConversations: [...state.extraConversations, conversation],
    })),
};
