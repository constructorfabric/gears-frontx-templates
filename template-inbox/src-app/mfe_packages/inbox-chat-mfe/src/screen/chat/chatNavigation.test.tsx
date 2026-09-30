import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { InboxScreenContext } from '@inbox-shared/lifecycle/screenContext';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';
import { recordingHistory } from '../../test-support/recordingHistory';
import { t } from '../../test-support/translate';

const page = vi.hoisted(() => ({ history: undefined as ReturnType<typeof recordingHistory> | undefined }));

// `openScreen` pushes through the FrontX routing singleton; here the
// singleton is the recording history, so the call site's push is read back
// as the shell's history would receive it.
vi.mock('@gears-frontx/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/routing')>()),
  resolveNavigationHistory: () => {
    if (page.history === undefined) throw new Error('no page history set up');
    return page.history;
  },
}));

const { useChatNavigation } = await import('./chatNavigation');

const CHAT_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox_chat.screens.chat.v1';

const frameWith = (addressed: boolean) => {
  const { bridge } = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    extensionId: CHAT_EXTENSION_ID,
    initialProperties: addressed
      ? { [FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES]: { [CHAT_EXTENSION_ID]: { domainKey: 'screen', extension: INBOX_SCREENS.chat } } }
      : {},
  });
  const portalContainer = { current: null };
  return ({ children }: { children: ReactNode }) => (
    <InboxScreenContext.Provider value={{ bridge, t, portalContainer }}>{children}</InboxScreenContext.Provider>
  );
};

describe('useChatNavigation', () => {
  it("pushes the contact's page in the contacts screen in place of the chat, once", () => {
    page.history = recordingHistory(`/?screen=${INBOX_SCREENS.chat}`);
    const { result } = renderHook(() => useChatNavigation(), { wrapper: frameWith(true) });

    result.current.viewContact?.('r-3');

    expect(page.history.writes).toEqual([`/?screen=${INBOX_SCREENS.contacts};route=r-3`]);
  });

  it('offers no contact link without an entry address, nor outside a frame', () => {
    page.history = recordingHistory('/');

    expect(renderHook(() => useChatNavigation(), { wrapper: frameWith(false) }).result.current.viewContact).toBeUndefined();
    expect(renderHook(() => useChatNavigation()).result.current.viewContact).toBeUndefined();
    expect(page.history.writes).toEqual([]);
  });
});
