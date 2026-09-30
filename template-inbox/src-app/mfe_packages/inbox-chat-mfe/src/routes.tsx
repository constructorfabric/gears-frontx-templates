import { createRootRoute, createRoute, Outlet } from '@gears-frontx/routing-tanstack';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@gears-frontx/ui-kit';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { useRouteFocus } from '@inbox-shared/lifecycle/useRouteFocus';
import { ScreenHeading } from '@inbox-shared/ui/ScreenHeading';
import sharedStyles from '@inbox-shared/ui/shared.module.css';
import { ChatScreen } from './screen/chat/ChatScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it: `/`
 * alone, the chat. The open channel and conversation are the screen's state
 * (`chatStore`), not its address, as they were before the screen became a
 * package, so Back from another screen returns to them without the address
 * naming them. An address with anything after the screen's token
 * (`?screen=chat;route=x`) names no page of it and gets the screen's own
 * not-found in place of the chat.
 */
function ChatRoot() {
  // One page, so the key never changes; the call keeps the screen on the same
  // focus rule as the others should it grow a second route.
  useRouteFocus('');
  return <Outlet />;
}

function ChatPage() {
  const t = useInboxT();
  return <ChatScreen t={t} />;
}

/** An address inside this screen that names no page of it. */
function ChatNotFound() {
  const t = useInboxT();
  return (
    <div className={sharedStyles.emptyPane} data-testid="chat-route-not-found">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            <ScreenHeading className={sharedStyles.inlineHeading}>{t('page_not_found_title')}</ScreenHeading>
          </EmptyTitle>
          <EmptyDescription>{t('page_not_found_description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

const rootRoute = createRootRoute({ component: ChatRoot, notFoundComponent: ChatNotFound });

const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ChatPage });

export const chatRouteTree = rootRoute.addChildren([chatRoute]);
