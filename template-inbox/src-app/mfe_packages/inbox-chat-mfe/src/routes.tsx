import { createRootRoute, createRoute } from '@gears-frontx/routing-tanstack';
import { useInboxT } from '@inbox-shared/lifecycle/screenContext';
import { ScreenNotFound, SinglePageRoot } from '@inbox-shared/ui/ScreenRoutes';
import { ChatScreen } from './screen/chat/ChatScreen';

/**
 * The screen's own routes, inside the entry the shell addressed for it: `/`
 * alone, the chat. The open channel and conversation are the screen's state
 * (`chatStore`), not its address, so Back from another screen returns to them
 * without the address naming them. An address with anything after the
 * screen's token (`?screen=chat;route=x`) names no page of it and gets the
 * screen's own not-found in place of the chat.
 */
function ChatPage() {
  const t = useInboxT();
  return <ChatScreen t={t} />;
}

const rootRoute = createRootRoute({
  component: SinglePageRoot,
  notFoundComponent: () => <ScreenNotFound testId="chat-route-not-found" />,
});

const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ChatPage });

export const chatRouteTree = rootRoute.addChildren([chatRoute]);
