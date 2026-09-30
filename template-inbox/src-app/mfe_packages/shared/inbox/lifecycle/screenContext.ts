import { createContext, useContext, type RefObject } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import type { Translate } from '../i18n/translate';

/**
 * What a screen's frame hands everything rendered inside it: the translator
 * for the shell's current language, the node every portalling kit component
 * renders into, and the bridge the screen was mounted with.
 *
 * The portal node is the reason this exists. The kit's `Sheet`, `Dialog`,
 * `Select`, `Combobox` and `DropdownMenu` portal to `document.body` unless
 * given a `container`, and `document.body` is outside the screen's shadow
 * root: a portal there renders without the kit's tokens, without the
 * package's CSS and outside the focus scope the screen owns. The frame
 * renders the node first, ahead of the screen, so every popup lands inside
 * the shadow root and above the screen's own content in document order.
 */
export type InboxScreenContextValue = {
  bridge: ChildMfeBridge;
  t: Translate;
  portalContainer: RefObject<HTMLDivElement | null>;
};

export const InboxScreenContext = createContext<InboxScreenContextValue | null>(null);

function useInboxScreenContext(): InboxScreenContextValue {
  const value = useContext(InboxScreenContext);
  if (value === null) throw new Error('[inbox] A screen component rendered outside InboxScreenFrame.');
  return value;
}

/** The translator of the frame the caller renders in. */
export const useInboxT = (): Translate => useInboxScreenContext().t;

/** The bridge of the frame the caller renders in. */
export const useInboxBridge = (): ChildMfeBridge => useInboxScreenContext().bridge;

/**
 * The bridge of the frame the caller renders in, or `undefined` outside a
 * frame (a component test rendering one screen alone), for a screen that
 * offers what needs the bridge only when there is one.
 */
export const useOptionalInboxBridge = (): ChildMfeBridge | undefined => useContext(InboxScreenContext)?.bridge;

/**
 * The node a portalling kit component takes as its `container`, or
 * `undefined` outside a frame (a component test rendering one component
 * alone), where the kit's default target is the only one there is.
 */
export const usePortalContainer = (): RefObject<HTMLDivElement | null> | undefined =>
  useContext(InboxScreenContext)?.portalContainer;
