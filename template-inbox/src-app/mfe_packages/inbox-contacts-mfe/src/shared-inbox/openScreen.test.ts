import { describe, expect, it } from 'vitest';
import {
  parseGrammar,
  serializeGrammar,
  type DomainKey,
  type Entry,
  type ExtensionToken,
  type Location,
  type NavigationHistory,
} from '@gears-frontx/routing';
import { ROUTE_PARAM_NAME } from '@gears-frontx/routing-tanstack';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { openScreen } from '@inbox-shared/navigation/openScreen';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';

/**
 * A `NavigationHistory` that records every write and answers `location` from
 * the last one, the part of template-shell's `fakeNavigation`
 * (`src-app/app/mfe/__tests__/fake-navigation.ts`) `openScreen` touches: it
 * reads the location and pushes once, and subscribes to nothing.
 */
function recordingHistory(initial: string): NavigationHistory & { writes: string[] } {
  let path = initial;
  const writes: string[] = [];
  const location = (): Location => {
    const url = new URL(path, 'http://shell.test');
    return { path: url.pathname, search: url.search.replace(/^\?/, ''), hash: url.hash.replace(/^#/, ''), position: writes.length };
  };
  return {
    writes,
    get location() {
      return location();
    },
    subscribe: () => () => undefined,
    push: (next) => {
      writes.push(next);
      path = next;
    },
    replace: (next) => {
      path = next;
    },
    go: () => undefined,
  };
}

const CHAT_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox_chat.screens.chat.v1';

const chatBridge = (addressed: boolean) =>
  createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    extensionId: CHAT_EXTENSION_ID,
    initialProperties: addressed
      ? { [FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES]: { [CHAT_EXTENSION_ID]: { domainKey: 'screen', extension: INBOX_SCREENS.chat } } }
      : {},
  }).bridge;

const entry = (domainKey: string, extension: string, route?: string): Entry => ({
  domainKey: domainKey as DomainKey,
  extension: extension as ExtensionToken,
  params: route === undefined ? [] : [{ name: ROUTE_PARAM_NAME, value: route }],
});

describe('openScreen', () => {
  it("replaces the caller's own entry with the target screen and its route, in one push", () => {
    const history = recordingHistory(`/?screen=${INBOX_SCREENS.chat}`);

    const pushed = openScreen(chatBridge(true), { screen: INBOX_SCREENS.contacts, route: 'r-42' }, history);

    expect(pushed).toBe(`/?screen=${INBOX_SCREENS.contacts};route=r-42`);
    expect(history.writes).toEqual([pushed]);
  });

  it("keeps every other domain's entry and the shell's own path as they were", () => {
    const initial = serializeGrammar({
      shellSubroute: '/',
      hash: undefined,
      entries: [entry('screen', INBOX_SCREENS.chat, 'thread-7'), entry('screen.chat.side', 'details')],
      foreignSegments: [],
    });
    const history = recordingHistory(initial);

    const pushed = openScreen(chatBridge(true), { screen: INBOX_SCREENS.contacts, route: 'r-1' }, history) ?? '';
    const url = new URL(pushed, 'http://shell.test');
    const parsed = parseGrammar({ shellSubroute: url.pathname, search: url.search.replace(/^\?/, ''), hash: undefined });

    expect(parsed.entries).toEqual([entry('screen', INBOX_SCREENS.contacts, 'r-1'), entry('screen.chat.side', 'details')]);
  });

  it("opens the target's root when no route is named", () => {
    const history = recordingHistory(`/?screen=${INBOX_SCREENS.chat}`);

    expect(openScreen(chatBridge(true), { screen: INBOX_SCREENS.contacts }, history)).toBe(`/?screen=${INBOX_SCREENS.contacts}`);
  });

  it('writes nothing and says so when the caller has no entry address', () => {
    const history = recordingHistory('/');

    expect(openScreen(chatBridge(false), { screen: INBOX_SCREENS.contacts, route: 'r-1' }, history)).toBeUndefined();
    expect(history.writes).toEqual([]);
  });
});
