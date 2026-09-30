/**
 * The mail mock backend's state, one object per page.
 *
 * Kept on `globalThis` under a registry symbol (`Symbol.for`), the way the
 * inbox's `mockStore.ts` keeps the conversations, rather than in a
 * module-level variable: a mock backend belongs to the page, not to one
 * evaluation of this package's modules. The mail it holds is still there
 * when the screen unmounts and mounts again, and would be for a second load
 * of the package too. No other screen reads mail, so it is a slot of its
 * own rather than a field of the inbox's shared state.
 *
 * Created lazily from the seed by the first reader and never serialized: the
 * mock map answers with clones. `revision` counts accepted writes and is what
 * the package's query cache is tied to (`registerMailApi`). A page reload
 * starts over from the seed.
 */

import { mails as seedMails } from './mailDataset';
import type { Mail } from './mailTypes';

/** The registry key of the mail state. Bump the suffix when the state's shape changes. */
export const MAIL_MOCK_STATE_KEY = Symbol.for('@gears-frontx/frontx-template-inbox/mail-mock-state/v1');

export type MailMockState = {
  /** Incremented on every accepted write. */
  revision: number;
  /** Every mail, the seed's and the ones sent this page. */
  mails: Mail[];
  /** The server-side id sequence for sent mail. */
  sentMailCount: number;
};

type Realm = typeof globalThis & { [MAIL_MOCK_STATE_KEY]?: MailMockState };

const realm = (): Realm => globalThis as Realm;

/** The page's mail state, created from the seed if nothing has read it yet. */
export function readMailMockState(): MailMockState {
  const page = realm();
  const existing = page[MAIL_MOCK_STATE_KEY];
  if (existing !== undefined) return existing;
  const created: MailMockState = { revision: 0, mails: structuredClone(seedMails), sentMailCount: 0 };
  page[MAIL_MOCK_STATE_KEY] = created;
  return created;
}

/** The number of writes the mail mock backend accepted so far. */
export const mailMockRevision = (): number => realm()[MAIL_MOCK_STATE_KEY]?.revision ?? 0;

/** Back to the seed and a fresh id sequence. For tests, between cases. */
export const resetMailMockState = (): void => {
  Reflect.deleteProperty(realm(), MAIL_MOCK_STATE_KEY);
};
