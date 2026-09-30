import { useMemo } from 'react';
import { readEntryAddress } from '@gears-frontx/react';
import { useOptionalInboxBridge } from '@inbox-shared/lifecycle/screenContext';
import { openScreen } from '@inbox-shared/navigation/openScreen';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';

export type ChatNavigation = {
  /**
   * Opens a contact's page in the contacts screen, in the chat's own place:
   * `?screen=contacts;route=<contactId>`, one history entry, so Back returns
   * to the chat as it was left. `undefined` when the chat runs without an
   * entry address - outside a shell domain there is no screen to open, and
   * the chat offers no link to one.
   */
  viewContact: ((contactId: string) => void) | undefined;
};

/** Where the chat screen goes beyond itself, through the shell's page address. */
export function useChatNavigation(): ChatNavigation {
  const bridge = useOptionalInboxBridge();
  return useMemo(() => {
    if (bridge === undefined || readEntryAddress(bridge) === undefined) return { viewContact: undefined };
    return {
      viewContact: (contactId: string) => void openScreen(bridge, { screen: INBOX_SCREENS.contacts, route: contactId }),
    };
  }, [bridge]);
}
