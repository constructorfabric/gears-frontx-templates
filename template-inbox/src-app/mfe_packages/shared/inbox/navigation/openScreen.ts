import {
  parseGrammar,
  resolveNavigationHistory,
  serializeGrammar,
  type Entry,
  type NavigationHistory,
} from '@gears-frontx/routing';
import { ROUTE_PARAM_NAME } from '@gears-frontx/routing-tanstack';
import { readEntryAddress, type ChildMfeBridge } from '@gears-frontx/react';
import type { InboxScreenToken } from './screens';

export type OpenScreenTarget = {
  /** The screen to open, by its address token (`INBOX_SCREENS`). */
  screen: InboxScreenToken;
  /** The path inside that screen's router, without the leading slash (`r-42` opens `/r-42`); none opens its `/`. */
  route?: string;
};

/**
 * Opens another inbox screen in the caller's own place, at a route inside it
 * ("View contact" in chat opens the person's page in contacts).
 *
 * No helper for this exists in FrontX routing yet. It reads the page address,
 * replaces the entry of the caller's own domain with one naming the target
 * screen and its route, keeps every other domain's entry as it is, and pushes
 * the result as one history entry: `/?screen=contacts;route=r-42`. The shell
 * resolves the token and mounts the target, which opens the route from its
 * entry; Back returns to the caller as it was.
 *
 * @param bridge - The caller's bridge, read for its own entry address
 * @param target - The screen and the route inside it
 * @param history - The page history; the FrontX routing singleton unless a test passes its own
 * @returns The pushed address, or `undefined` when the caller runs without an
 *   entry address (not composed into a shell domain), where there is no
 *   domain to navigate in and the caller should not offer the link
 */
export function openScreen(
  bridge: ChildMfeBridge,
  target: OpenScreenTarget,
  history: NavigationHistory = resolveNavigationHistory()
): string | undefined {
  const own = readEntryAddress(bridge);
  if (own === undefined) return undefined;
  const { path, search, hash } = history.location;
  const parsed = parseGrammar({ shellSubroute: path, search, hash: hash === '' ? undefined : hash });
  const next: Entry = {
    domainKey: own.domainKey,
    // The grammar types an extension token as a branded string; the token is
    // one of the constants in `screens.ts`, held to the manifests by a test.
    extension: target.screen as Entry['extension'],
    params: target.route === undefined ? [] : [{ name: ROUTE_PARAM_NAME, value: target.route }],
  };
  let replaced = false;
  const entries = parsed.entries.map((entry) => {
    if (entry.domainKey !== own.domainKey) return entry;
    replaced = true;
    return next;
  });
  if (!replaced) entries.push(next);
  const serialized = serializeGrammar({
    shellSubroute: parsed.shellSubroute,
    hash: parsed.hash,
    entries,
    foreignSegments: parsed.foreignSegments,
  });
  history.push(serialized);
  return serialized;
}
