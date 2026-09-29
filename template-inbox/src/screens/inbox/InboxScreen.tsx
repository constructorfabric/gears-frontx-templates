import { useEffect, useMemo, useState } from 'react';
import { InboxIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@gears-frontx/ui-kit';
import { useApiMutation, useApiQuery } from '../../api/queries';
import { getInboxApi } from '../../api/registry';
import { BRAND, NO_TEAM_INBOX } from '../../api/constants';
import type {
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  Message,
  PostMessageRequest,
  PostMessageResponse,
} from '../../api/types';
import type { Translate } from '../../shared/i18n';
import { contactRoute, navigate } from '../../app/routing';
import { cx } from '../../shared/cx';
import { firstPaintOf, LoadErrorPane, LoadingPane } from '../../shared/QueryStates';
import { useAutoSelect } from '../../shared/useAutoSelect';
import { SINGLE_PANE_QUERY, useMediaQuery } from '../../shared/useMediaQuery';
import { useSidebarToggle } from '../../shared/useSidebarToggle';
import { ConversationList } from './ConversationList';
import { ConversationThread } from './ConversationThread';
import { countOpen, selectConversations } from './conversationOrdering';
import { CustomerDetailsPanel } from './CustomerDetailsPanel';
import { FolderSidebar } from './FolderSidebar';
import { inboxActions, inboxStore, useInbox } from './inboxStore';
import sharedStyles from '../../shared/shared.module.css';

export type InboxScreenProps = {
  t: Translate;
};

/**
 * The chat screen: channels, the conversation list, the open thread and the
 * customer details panel.
 *
 * What the agent selects, types and changes lives in `inboxStore`, outside
 * this component, so leaving the screen and coming back finds it as it was.
 * Each pane reads only the slice it shows; in particular the draft is read by
 * the composer alone, so a keystroke re-renders the composer and nothing
 * else. What stays here is per mount: posts in flight, a failed post's
 * error, and the replies this mount has sent (the next mount reads them back
 * from the service).
 */
export function InboxScreen({ t }: InboxScreenProps) {
  const service = getInboxApi();

  const agentQuery = useApiQuery(service.getAgent);
  const channelsQuery = useApiQuery(service.getChannels);
  const conversationsQuery = useApiQuery(service.getConversations);
  const messagesQuery = useApiQuery(service.getMessages);
  const contactsQuery = useApiQuery(service.getContacts);

  const channelId = useInbox((state) => state.channelId);
  const [selectedId, setSelectedId] = useState(() => inboxStore.get().selectedId);
  useEffect(() => inboxActions.rememberSelection(selectedId), [selectedId]);
  const search = useInbox((state) => state.search);
  const sort = useInbox((state) => state.sort);
  const composerTab = useInbox((state) => state.composerTab);
  const detailsVisible = useInbox((state) => state.detailsVisible);
  const patches = useInbox((state) => state.patches);
  const extraChannels = useInbox((state) => state.extraChannels);
  const extraConversations = useInbox((state) => state.extraConversations);

  // Replies this mount has posted. The service keeps them too, so the next
  // mount reads them back with the transcript; until then they are appended
  // here, and a message the transcript already holds is never shown twice.
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  // Conversations with a post in flight, so one thread's send never shows
  // another thread's composer as busy.
  const [sendingIds, setSendingIds] = useState<Record<string, number>>({});
  // The conversations whose latest post failed; their draft is kept.
  const [failedIds, setFailedIds] = useState<Record<string, true>>({});
  // Bumped right after opening a just-created conversation, so the composer
  // knows to focus the reply box.
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);

  const channelsSidebar = useSidebarToggle();
  const isSinglePane = useMediaQuery(SINGLE_PANE_QUERY);

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
    // The mock store keeps the posted message, so the cached transcript is
    // stale once the post succeeds and the next mount reads it again.
    invalidates: [service.getMessages],
    onSuccess: (response, request) => {
      setSentMessages((previous) => [...previous, response.message]);
      finishSending(request.conversationId);
      inboxActions.clearDraftIfSent(request.conversationId, request.body);
    },
    // A failed post keeps the draft where it is, so nothing typed is lost,
    // and the composer says the post did not go out.
    onError: (_error, request) => {
      finishSending(request.conversationId);
      setFailed(request.conversationId, true);
    },
  });

  const conversations: Conversation[] = useMemo(() => {
    const fetched = conversationsQuery.data?.conversations ?? [];
    const patched = fetched.map((conversation) => ({ ...conversation, ...patches[conversation.id] }));
    return [...patched, ...extraConversations];
  }, [conversationsQuery.data, patches, extraConversations]);

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
  });

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
    inboxActions.selectChannel(nextChannelId);
    setSelectedId(null);
    autoSelect.arm(nextChannelId);
  };

  /**
   * A demo-grade channel, switched into immediately - it lands on the same
   * empty state any channel with no conversations renders, since it is a
   * real `Channel` row from here on, not a stub.
   */
  const createChannel = (name: string) => {
    const channel = { id: `channel-${crypto.randomUUID()}`, label: name, icon: 'hash' as const, itemCount: 0, openCount: 0 };
    inboxActions.addChannel(channel);
    setSelectedId(null);
    autoSelect.arm(channel.id);
  };

  /**
   * A demo-grade conversation with an existing contact, in the current
   * channel, opened immediately with an empty transcript. Sending into it goes
   * through the same post as any other thread (the mock endpoint stores a post
   * for any `conversationId`); the conversation itself is not posted anywhere,
   * so it lasts for the session.
   */
  const startChat = (contactId: string) => {
    const contact = contactsById.get(contactId);
    const id = `dm-${crypto.randomUUID()}`;
    inboxActions.addConversation({
      id,
      channelId,
      subject: contact?.name ?? '',
      contactId,
      snippet: '',
      lastActivityAt: new Date().toISOString(),
      unreadCount: 0,
      priority: 'none',
      status: 'open',
      assignee: agentQuery.data?.agent.name ?? '',
      teamInbox: NO_TEAM_INBOX,
      channel: 'chat',
      brand: BRAND,
      tags: [],
      sharedFiles: [],
      suggestedReplies: [],
      starred: false,
      snoozed: false,
      pinned: false,
    });
    setSelectedId(id);
    setComposerFocusSignal((signal) => signal + 1);
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
    inboxActions.patchConversation(selected.id, {
      tags: isSpam ? selected.tags.filter((tag) => tag !== 'spam') : [...selected.tags, 'spam'],
    });
  };

  // The draft is read at send time rather than held here, so typing never
  // re-renders this component.
  const sendCurrentDraft = () => {
    if (!selected || selected.status === 'closed') return;
    const body = (inboxStore.get().drafts[selected.id] ?? '').trim();
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
        onSelectChannel={selectChannel}
        onCreateChannel={createChannel}
        collapsed={channelsSidebar.collapsed}
        t={t}
      />

      <ConversationList
        conversations={visibleConversations}
        contactsById={contactsById}
        channelLabel={channelLabel}
        selectedConversationId={selectedId}
        onSelectConversation={setSelectedId}
        onStartChat={startChat}
        search={search}
        onSearchChange={inboxActions.setSearch}
        sort={sort}
        onSortChange={inboxActions.setSort}
        onToggleChannels={channelsSidebar.toggle}
        channelsOpen={!channelsSidebar.collapsed}
        hidden={isSinglePane && showThread}
        t={t}
      />

      <div className={cx(sharedStyles.detailPane, isSinglePane && !showThread && sharedStyles.singlePaneHidden)}>
        {selected ? (
          <>
            <ConversationThread
              conversation={selected}
              contact={contactsById.get(selected.contactId)}
              agent={agentQuery.data?.agent}
              messages={threadMessages}
              detailsVisible={detailsVisible}
              onToggleDetails={inboxActions.toggleDetails}
              onToggleStar={() => inboxActions.patchConversation(selected.id, { starred: !selected.starred })}
              onToggleSnooze={() =>
                inboxActions.patchConversation(selected.id, {
                  snoozed: !selected.snoozed,
                  status: selected.snoozed ? 'open' : 'snoozed',
                })
              }
              onToggleSpam={toggleSpam}
              isSpam={isSpam}
              onCloseConversation={() => {
                inboxActions.patchConversation(selected.id, { status: 'closed' });
                setSelectedId(null);
              }}
              onBack={isSinglePane ? () => setSelectedId(null) : null}
              onUseSuggestedReply={(reply) => {
                // A suggestion is a draft, not a send: it lands in the reply
                // box for the agent to edit, and the tab switches because a
                // suggestion is never an internal note.
                inboxActions.setComposerTab('reply');
                inboxActions.appendToDraft(selected.id, reply);
              }}
              composer={{
                conversationId: selected.id,
                tab: composerTab,
                onTabChange: inboxActions.setComposerTab,
                onSend: sendCurrentDraft,
                sending: (sendingIds[selected.id] ?? 0) > 0,
                failed: selected.id in failedIds,
                disabled: selected.status === 'closed',
                focusSignal: composerFocusSignal,
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
                onViewContact={() => navigate(contactRoute(selected.contactId))}
                onAssigneeChange={(assignee: string) => inboxActions.patchConversation(selected.id, { assignee })}
                onTeamInboxChange={(teamInbox: string) => inboxActions.patchConversation(selected.id, { teamInbox })}
                onPriorityChange={(priority: ConversationPriority) =>
                  inboxActions.patchConversation(selected.id, { priority })
                }
                onStatusChange={(status: ConversationStatus) =>
                  inboxActions.patchConversation(selected.id, { status, snoozed: status === 'snoozed' })
                }
                onToggleSpam={toggleSpam}
                onAddTag={(tag: string) => inboxActions.patchConversation(selected.id, { tags: [...selected.tags, tag] })}
                onRemoveTag={(tag: string) =>
                  inboxActions.patchConversation(selected.id, {
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
