/**
 * Registration of the inbox API services, one registrar per service.
 *
 * Each screen package registers only the services its screen reads, in its
 * `init.ts` and before `createFrontX().build()`: the framework's `mock()`
 * plugin switches the mock plugins of the services already registered when
 * the app is built. A registrar per service, rather than one that registers
 * every service, is what keeps a package from bundling a seed it never reads:
 * mail never imports the inbox dataset, contacts never imports the mail one.
 *
 * `apiRegistry` rather than a bare `new InboxApiService()` because the
 * registry is where every service goes: it instantiates on registration and
 * hands the same instance to every caller, so a screen asks for a service by
 * class and never has to be told where the instance lives. Each MFE load has
 * its own registry, so each package registers for itself.
 *
 * Whether the seed datasets answer is decided by the `mock()` plugin each
 * package adds in `init.ts`, called there with `enabledByDefault: true`
 * because this template ships no backend. A project that has one passes
 * `false` (or drops the option to keep mocks on localhost only); the
 * endpoints, the response types and the screens stay unchanged.
 */

import { apiRegistry } from '@gears-frontx/react';
import { InboxApiService } from './InboxApiService';
import { inboxMockRevision } from './mockStore';
import { setQueryCacheEpoch } from './queries';

/**
 * Registers the conversations, transcript, contacts and agent service, and
 * ties this package's query cache to the page-wide mock store, so a write
 * another screen made reaches this one on its next read. Idempotent.
 */
export function registerInboxApi(): void {
  if (apiRegistry.has(InboxApiService)) return;
  apiRegistry.register(InboxApiService);
  setQueryCacheEpoch(inboxMockRevision);
}

export const getInboxApi = (): InboxApiService => apiRegistry.getService(InboxApiService);
