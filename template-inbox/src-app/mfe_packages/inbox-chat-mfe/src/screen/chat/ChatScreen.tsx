import { useEffect, useMemo, useState } from 'react';
import { InboxIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@gears-frontx/ui-kit';
import { useApiMutation, useApiQuery } from '@inbox-shared/api/queries';
import { getInboxApi } from '@inbox-shared/api/registry';
import type {
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  CreateConversationRequest,
  CreateConversationResponse,
  Message,
  PostMessageRequest,
  PostMessageResponse,
} from '@inbox-shared/api/types';
import type { Translate } from '@inbox-shared/i18n/translate';
import { cx } from '@inbox-shared/ui/cx';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '@inbox-shared/ui/QueryStates';
import { useAutoSelect } from '@inbox-shared/ui/useAutoSelect';
import { useScreenLayout } from '@inbox-shared/ui/screenLayout';
import { useSidebarToggle } from '@inbox-shared/ui/useSidebarToggle';
import { uniqueSuffix } from '@inbox-shared/ui/uniqueSuffix';
import { ConversationList } from './ConversationList';
import { ConversationThread } from './ConversationThread';
import { countOpen, selectConversations } from './conversationOrdering';
import { CustomerDetailsPanel } from './CustomerDetailsPanel';
import { useChatNavigation } from './chatNavigation';
import { FolderSidebar } from './FolderSidebar';
import { chatActions, chatStore, useChat } from './chatStore';
import styles from './chat.module.css';
import sharedStyles from '@inbox-shared/ui/shared.module.css';

export type ChatScreenProps = {
  t: Translate;
};

/**
 * The chat screen: channels, the conversation list, the open thread and the
 * customer details panel.
 *
 * What the agent selects, types and changes lives in `chatStore`, outside
 * this component, so leaving the screen and coming back finds it as it was.
 * Each pane reads only the slice it shows; in particular the draft is read by
 * the composer alone, so a keystroke re-renders the composer and nothing
 * else. What stays here is per mount: posts in flight, a failed post's
 * error, and the replies this mount has sent (the next mount reads them back
 * from the service). The contacts screen follows the same split over its own
 * store.
 */
export function ChatScreen({ t }: ChatScreenProps) {
  const service = getInboxApi();
  const navigation = useChatNavigation();

  const agentQuery = useApiQuery(service.getAgent);
  const channelsQuery = useApiQuery(service.getChannels);
  const conversationsQuery = useApiQuery(service.getConversations);
  const messagesQuery = useApiQuery(service.getMessages);
  const contactsQuery = useApiQuery(service.getContacts);

  const channelId = useChat((state) => state.channelId);
  // The open conversation is the screen's own state while it is mounted: the
  // automatic first pick is decided during render, where only a component's
  // own state may change. It is written back to the store with the pick
  // still owed, so a later mount starts from both.
  const [selectedId, setSelectedId] = useState(() => chatStore.get().selectedId);
  const search = useChat((state) => state.search);
  const sort = useChat((state) => state.sort);
  const composerTab = useChat((state) => state.composerTab);
  const detailsVisible = useChat((state) => state.detailsVisible);
  const patches = useChat((state) => state.patches);
  const extraChannels = useChat((state) => state.extraChannels);
  const extraConversations = useChat((state) => state.extraConversations);

  // Replies this mount has posted. The service keeps them too, so the next
  // mount reads them back with the transcript; until then they are appended
  // here, and a message the transcript already holds is never shown twice.
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  // Conversations with a post in flight, so one thread's send never shows
  // another thread's composer as busy.
  const [sendingIds, setSendingIds] = useState<Record<string, number>>({});
  // The conversations whose latest post failed; their draft is kept.
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  // The latest attempt to start a conversation failed.
  const [startChatFailed, setStartChatFailed] = useState(false);

  const channelsSidebar = useSidebarToggle();
  const isSinglePane = useScreenLayout() === 'single';

  const setFailed = (conversationId: string, failed: boolean) =>
    setFailedIds((previous) => {
      if (failed === (conversationId in previous)) return previous;
      const next = { ...previous };
      if (failed) next[conversationId] = true;
      else delete next[conversationId];
      return next;
    });

  const finishSending = (conversationId: string) =>
    setSendingIds((previous) => {
      const remaining = (previous[conversationId] ?? 1) - 1;
      const next = { ...previous };
      if (remaining > 0) next[conversationId] = remaining;
      else delete next[conversationId];
      return next;
    });

  const sendMessage = useApiMutation<PostMessageResponse, PostMessageRequest>({
    endpoint: service.postMessage,
    // The mock store keeps the posted message and moves its conversation's
    // snippet and last activity, so the cached transcript and list are stale
    // once the post succeeds and the next mount reads both again.
    invalidates: [service.getMessages, service.getConversations],
    // The draft lives in the store, so it is cleared even when the agent left
    // the screen before the post came back; otherwise the next visit would
    // show the sent text still in the box, ready to be sent twice.
    afterSuccess: (_response, request) => chatActions.clearDraftIfSent(request.conversationId, request.body),
    onSuccess: (response, request) => {
      setSentMessages((previous) => [...previous, response.message]);
      finishSending(request.conversationId);
    },
    // A failed post keeps the draft where it is, so nothing typed is lost,
    // and the composer says the post did not go out.
    onError: (_error, request) => {
      finishSending(request.conversationId);
      setFailed(request.conversationId, true);
    },
  });

  const startConversation = useApiMutation<CreateConversationResponse, CreateConversationRequest>({
    endpoint: service.createConversation,
    invalidates: [service.getConversations],
    afterSuccess: (response) => chatActions.addConversation(response.conversation),
    // Opened only if the agent is still in the channel it was started from:
    // after a switch the list would highlight nothing while the thread and
    // the composer focus jumped to it. It stays in its own channel's list.
    onSuccess: (response) => {
      if (response.conversation.channelId !== chatStore.get().channelId) return;
      setSelectedId(response.conversation.id);
      chatActions.requestComposerFocus();
    },
    onError: () => setStartChatFailed(true),
  });

  // The fetched list, the conversations started since it was read, and the
  // replies this mount sent, with the agent's own changes over all of them: a
  // started conversation takes a star, a status or a tag like any other.
  const conversations: Conversation[] = useMemo(() => {
    const fetched = conversationsQuery.data?.conversations ?? [];
    const fetchedIds = new Set(fetched.map((conversation) => conversation.id));
    const latestSent = new Map<string, Message>();
    for (const message of sentMessages) latestSent.set(message.conversationId, message);
    return [...fetched, ...extraConversations.filter((conversation) => !fetchedIds.has(conversation.id))].map(
      (conversation) => {
        const sent = latestSent.get(conversation.id);
        const activity =
          sent !== undefined && Date.parse(sent.sentAt) > Date.parse(conversation.lastActivityAt)
            ? { snippet: sent.body, lastActivityAt: sent.sentAt }
            : null;
        return { ...conversation, ...activity, ...patches[conversation.id] };
      }
    );
  }, [conversationsQuery.data, extraConversations, sentMessages, patches]);

  const contactsById = useMemo(() => {
    const index = new Map<string, Contact>();
    for (const contact of contactsQuery.data?.contacts ?? []) index.set(contact.id, contact);
    return index;
  }, [contactsQuery.data]);

  const visibleConversations = useMemo(
    () => selectConversations(conversations, contactsById, channelId, search, sort),
    [conversations, contactsById, channelId, search, sort]
  );

  const autoSelect = useAutoSelect({
    scope: channelId,
    settled: !conversationsQuery.isLoading && !contactsQuery.isLoading,
    firstId: visibleConversations[0]?.id,
    selectedId,
    onSelect: setSelectedId,
    initialOwedTo: chatStore.get().autoSelectOwedTo,
  });
  useEffect(
    () => chatActions.rememberSelection(selectedId, autoSelect.owedTo),
    [selectedId, autoSelect.owedTo]
  );

  // Selected from the whole collection rather than the visible slice: typing a
  // search narrows the list without closing the thread the agent is reading.
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  const threadMessages = useMemo(() => {
    if (!selected) return [];
    const fetched = messagesQuery.data?.messages ?? [];
    const fetchedIds = new Set(fetched.map((message) => message.id));
    return [...fetched, ...sentMessages.filter((message) => !fetchedIds.has(message.id))].filter(
      (message) => message.conversationId === selected.id
    );
  }, [messagesQuery.data, sentMessages, selected]);

  const channels = useMemo(() => {
    const rows = [...(channelsQuery.data?.channels ?? []), ...extraChannels];
    return rows.map((channel) => {
      const inChannel = conversations.filter((conversation) => conversation.channelId === channel.id);
      return { ...channel, itemCount: inChannel.length, openCount: countOpen(inChannel) };
    });
  }, [channelsQuery.data, extraChannels, conversations]);

  const selectChannel = (nextChannelId: string) => {
    chatActions.selectChannel(nextChannelId);
    setSelectedId(null);
    autoSelect.arm(nextChannelId);
  };

  /**
   * A demo-grade channel, switched into immediately - it lands on the same
   * empty state any channel with no conversations renders, since it is a
   * real `Channel` row from here on, not a stub.
   */
  const createChannel = (name: string) => {
    const channel = { id: `channel-${uniqueSuffix()}`, label: name, icon: 'hash' as const, itemCount: 0, openCount: 0 };
    chatActions.addChannel(channel);
    setSelectedId(null);
    autoSelect.arm(channel.id);
  };

  /**
   * A conversation with an existing contact, in the current channel, assigned
   * to the agent. The server creates it (id, timestamps, an empty transcript)
   * and it opens with the reply box focused once the answer arrives; sending
   * into it is the same post as into any other thread.
   */
  const startChat = (contactId: string) => {
    setStartChatFailed(false);
    startConversation.mutate({ channelId, contactId, assignee: agentQuery.data?.agent.name ?? '' });
  };

  const firstPaint = firstPaintOf([agentQuery, channelsQuery, conversationsQuery, messagesQuery, contactsQuery]);
  if (firstPaint.failed) return <LoadErrorPane onRetry={firstPaint.retry} t={t} />;
  if (firstPaint.loading) return <LoadingPane />;

  const channelLabel = channels.find((channel) => channel.id === channelId)?.label ?? '';
  const isSpam = selected?.tags.includes('spam') ?? false;
  const showThread = selected !== null;

  // Spam is a tag, not a channel: the conversation stays put in whichever
  // channel it is already in, so marking or unmarking it never moves the
  // selection out from under the agent. The thread header's menu and the
  // details panel both call this.
  const toggleSpam = () => {
    if (!selected) return;
    chatActions.patchConversation(selected.id, {
      tags: isSpam ? selected.tags.filter((tag) => tag !== 'spam') : [...selected.tags, 'spam'],
    });
  };

  // The draft is read at send time rather than held here, so typing never
  // re-renders this component.
  const sendCurrentDraft = () => {
    if (!selected || selected.status === 'closed') return;
    const body = (chatStore.get().drafts[selected.id] ?? '').trim();
    if (body === '') return;
    setFailed(selected.id, false);
    setSendingIds((previous) => ({ ...previous, [selected.id]: (previous[selected.id] ?? 0) + 1 }));
    sendMessage.mutate({ conversationId: selected.id, body, kind: composerTab });
  };

  return (
    <>
      <FolderSidebar
        channels={channels}
        selectedChannelId={channelId}
        onSelectChannel={(nextChannelId) => {
          selectChannel(nextChannelId);
          channelsSidebar.dismiss();
        }}
        onCreateChannel={(name) => {
          createChannel(name);
          channelsSidebar.dismiss();
        }}
        column={channelsSidebar}
        t={t}
      />

      <ConversationList
        conversations={visibleConversations}
        contactsById={contactsById}
        channelLabel={channelLabel}
        selectedConversationId={selectedId}
        onSelectConversation={setSelectedId}
        onStartChat={startChat}
        startChatFailed={startChatFailed}
        search={search}
        onSearchChange={chatActions.setSearch}
        sort={sort}
        onSortChange={chatActions.setSort}
        onToggleChannels={channelsSidebar.toggle}
        channelsOpen={!channelsSidebar.collapsed}
        hidden={isSinglePane && showThread}
        t={t}
      />

      <div
        className={cx(
          sharedStyles.detailPane,
          isSinglePane && !showThread && sharedStyles.singlePaneHidden,
          showThread && detailsVisible && styles.detailPaneWithDetails
        )}
      >
        {selected ? (
          <>
            <ConversationThread
              conversation={selected}
              contact={contactsById.get(selected.contactId)}
              agent={agentQuery.data?.agent}
              messages={threadMessages}
              detailsVisible={detailsVisible}
              onToggleDetails={chatActions.toggleDetails}
              onToggleStar={() => chatActions.patchConversation(selected.id, { starred: !selected.starred })}
              onToggleSnooze={() =>
                chatActions.patchConversation(selected.id, {
                  snoozed: !selected.snoozed,
                  status: selected.snoozed ? 'open' : 'snoozed',
                })
              }
              onToggleSpam={toggleSpam}
              isSpam={isSpam}
              onCloseConversation={() => {
                // A closed conversation is no longer snoozed: the flag would
                // otherwise keep the alarm pressed and reopen it on a click.
                chatActions.patchConversation(selected.id, { status: 'closed', snoozed: false });
                setSelectedId(null);
              }}
              onBack={isSinglePane ? () => setSelectedId(null) : null}
              onUseSuggestedReply={(reply) => {
                // A suggestion is a draft, not a send: it lands in the reply
                // box for the agent to edit, and the tab switches because a
                // suggestion is never an internal note.
                chatActions.setComposerTab('reply');
                chatActions.appendToDraft(selected.id, reply);
              }}
              composer={{
                conversationId: selected.id,
                tab: composerTab,
                onTabChange: chatActions.setComposerTab,
                onSend: sendCurrentDraft,
                sending: (sendingIds[selected.id] ?? 0) > 0,
                failed: selected.id in failedIds,
                disabled: selected.status === 'closed',
                t,
              }}
              t={t}
            />
            {detailsVisible ? (
              <CustomerDetailsPanel
                conversation={selected}
                contact={contactsById.get(selected.contactId)}
                agent={agentQuery.data?.agent}
                isSpam={isSpam}
                onViewContact={
                  navigation.viewContact === undefined
                    ? undefined
                    : () => navigation.viewContact?.(selected.contactId)
                }
                onAssigneeChange={(assignee: string) => chatActions.patchConversation(selected.id, { assignee })}
                onTeamInboxChange={(teamInbox: string) => chatActions.patchConversation(selected.id, { teamInbox })}
                onPriorityChange={(priority: ConversationPriority) =>
                  chatActions.patchConversation(selected.id, { priority })
                }
                onStatusChange={(status: ConversationStatus) =>
                  chatActions.patchConversation(selected.id, { status, snoozed: status === 'snoozed' })
                }
                onToggleSpam={toggleSpam}
                onAddTag={(tag: string) => chatActions.patchConversation(selected.id, { tags: [...selected.tags, tag] })}
                onRemoveTag={(tag: string) =>
                  chatActions.patchConversation(selected.id, {
                    tags: selected.tags.filter((existing) => existing !== tag),
                  })
                }
                t={t}
              />
            ) : null}
          </>
        ) : (
          <div className={sharedStyles.emptyPane}>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>{t('empty_title')}</EmptyTitle>
                <EmptyDescription>{t('empty_description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </>
  );
}
