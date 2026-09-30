# Guideline: The Inbox Screens' Data

The four inbox screens are separate microfrontend packages under `src-app/mfe_packages/`, and every MFE load evaluates its own copy of each module it bundles. This guideline covers how their data stays one set of facts anyway: where the services and seeds live, how the mock backend is shared across the packages, how each package's query cache learns about writes made elsewhere, and how a real backend replaces the mocks. Paths below are relative to `src-app/mfe_packages/`.

## Where the data lives

```
shared/inbox/api/                 imported as @inbox-shared/api/*, bundled into each package that imports it
  InboxApiService.ts              conversations, transcript, contacts and agent, baseURL /api/inbox
  mocks.ts                        inboxMockMap, keys prefixed with /api/inbox
  dataset.ts                      the inbox seed: agent, channels, conversations, messages, contacts
  mockStore.ts                    the page-wide inbox mock state (readInboxMockState, inboxMockRevision)
  queries.ts                      useApiQuery / useApiMutation and the cache epoch (setQueryCacheEpoch)
  registry.ts                     registerInboxApi, getInboxApi
  RestMockPlugin.ts               the mock plugin every service registers, mockReply, MockResponseError
  seedClock.ts                    the page-wide anchor every seed instant is measured from
  constants.ts                    ids the screens share with the API (CHANNEL_GENERAL, BRAND, NO_TEAM_INBOX, TEAM_INBOXES)
  types.ts, dashboardTypes.ts     response contracts
inbox-dashboard-mfe/src/api/      DashboardApiService (/api/dashboard), dashboardMocks.ts, dashboardDataset.ts, registerDashboardApi
inbox-mail-mfe/src/api/           MailApiService (/api/mail), mailMocks.ts, mailDataset.ts, mailMockStore.ts, registerMailApi, constants.ts (MAILBOX_*)
```

A service and its seed live in the package that reads them unless another screen reads them too: contacts, dashboard and chat share `InboxApiService` from `shared/inbox/api/`; the dashboard overview and mail each stay in their own package, so mail never bundles the inbox seed and contacts never bundles the mail one. Seed datasets are imported by mock maps and tests, never by a screen.

## Registration, one registrar per service

Each package calls the registrars of the services its screen reads in its `src/init.ts`, before `createFrontX().build()`:

| Package | Registrars |
|---|---|
| `inbox-contacts-mfe` | `registerInboxApi` |
| `inbox-dashboard-mfe` | `registerInboxApi`, `registerDashboardApi` |
| `inbox-chat-mfe` | `registerInboxApi` |
| `inbox-mail-mfe` | `registerMailApi` |

A registrar registers its service with `apiRegistry` (idempotent) and, for a service with a page-wide mock state, names that state's revision as the package's cache epoch (`setQueryCacheEpoch(inboxMockRevision)`, `setQueryCacheEpoch(mailMockRevision)`). Each MFE load has its own `apiRegistry`, so each package registers for itself. A screen reads through the getter, never through `new`:

```ts
const contactsQuery = useApiQuery(getInboxApi().getContacts);
```

## One mock state per page

`shared/inbox/api/mockStore.ts` keeps the inbox mock state on `globalThis` under `Symbol.for('@gears-frontx/frontx-template-inbox/mock-state/v2')`. Every package's copy of the module resolves the same key, so a reply posted in chat is in the contact's activity in contacts. The state is created from the seed by the first reader, holds `contacts`, `conversations`, `messages` and a `revision` every accepted write increments, and lasts until the page reloads. Mail keeps its own state the same way under `Symbol.for('@gears-frontx/frontx-template-inbox/mail-mock-state/v1')` in `inbox-mail-mfe/src/api/mailMockStore.ts`. The seed anchor in `seedClock.ts` is page-wide too (`Symbol.for('@gears-frontx/frontx-template-inbox/seed-anchor/v1')`), so every package measures "an hour ago" from the same instant.

Bump a key's version suffix whenever the shape of what it holds changes: a state left in the page by a build with another shape is otherwise read as if it matched. The dashboard's activity rows are built from the inbox state's contacts on each request (`dashboardMocks.ts`), so every row names a person the directory lists.

## The query cache and its epoch

`queries.ts` is the whole server-state layer: `useApiQuery(descriptor)` dedupes by the descriptor's key and keeps an answer for the page's lifetime; `useApiMutation({ endpoint, invalidates, onSuccess, onError, afterSuccess })` forgets the reads named in `invalidates` once the write succeeds. Each package bundles its own copy, so each has its own cache over the one shared state. The epoch keeps them honest:

- a read under a revision other than the cache's drops every settled answer and asks again;
- a request still running from before the revision moved answers whoever waits for it, is not kept, and is not joined by a later mount;
- a package's own write moves its cache past its own revision, keeping other answers, only when the revision moved by exactly one from the epoch the write started under; any other move is treated as a write from another screen.
- every request the cache makes passes `staleTime: 0` to the descriptor's `fetch`, so no settled answer is served from the page-wide fetch cache the shell retains (`frontx:fetch-cache`), which every package shares; a request still pending there is joined whatever `staleTime` asks, so when the cache replaces one of its own requests that predates a write, it evicts the key there too (`invalidate`) and the older request's readers take the newer answer.

A screen gates its first paint on the queries it needs with `firstPaintOf` from `shared/inbox/ui/QueryStates.tsx` (`LoadErrorPane` on failure, `LoadingPane` while pending).

## The mock switch

Each `init.ts` adds the framework's `mock({ enabledByDefault: true })`, which switches on the `RestMockPlugin` of every service registered before `build()`. While on, the plugin answers every request of its protocol: a mapped `METHOD /path` with its factory's value (or the status of a `mockReply(status, data)`), an unmapped route with 404, a status of 400 or above as a rejected `MockResponseError`, after a 100 ms delay that an aborted signal cuts short. Factories answer with clones, so nothing a screen does to a response reaches the state.

## The endpoints

| Endpoint | Answers |
|---|---|
| `GET /api/inbox/me` | the agent: name, presence, workspace |
| `GET /api/inbox/channels` | the seeded channels |
| `GET /api/inbox/conversations` | every conversation, including those started this page |
| `GET /api/inbox/messages` | every message, including those posted this page |
| `GET /api/inbox/contacts` | every contact with its detail payload |
| `POST /api/inbox/messages` | stores a reply or note (400 without a conversation, text or a `reply`/`note` kind, 404 for an unknown conversation) |
| `POST /api/inbox/conversations` | starts a conversation with an existing contact (400 without a channel or contact, 404 for an unknown contact) |
| `GET /api/dashboard/overview` | the whole dashboard in one response: KPI cards, charts, workload, funnel, conversion by source, top agents, activity rows |
| `GET /api/mail/mailboxes` | the mailboxes |
| `GET /api/mail/mails` | every mail, including those sent this page |
| `GET /api/mail/messages` | the earlier messages behind a mail's history toggle |
| `POST /api/mail/mails` | files a sent mail under Sent (400 without a recipient, or without both subject and body) |

Every read returns a whole collection: `RestMockPlugin` matches exact keys and passes a factory the request body only, so selection happens in the screen over a collection it holds. A new slice is a new collection endpoint, not a parameterised one. What the details panels change (assignee, priority, status, tags, spam, a new channel) lives in each screen's store, not in the services; a new persisted change is a new mutation on the service and its mock map.

## Replacing the mocks with a real backend

1. Serve the endpoints above, with the response types in `types.ts`, `dashboardTypes.ts` and `inbox-mail-mfe/src/api/mailTypes.ts`, at the services' base URLs (or change `baseURL` in each service's constructor).
2. In each package's `src/init.ts` pass `mock({ enabledByDefault: false })`, or `mock()` to keep mocks on localhost only.
3. Keep the registrars. Without a mock state the revision stays 0 and the epoch never moves; a backend that pushes changes can call `setQueryCacheEpoch` with its own counter, or `queries.ts` can be replaced by a server-state library, since the screens only see `useApiQuery` and `useApiMutation`.

## Content rules

- Seed data is TypeScript registered through the mock maps; no fixture files, no content in markup.
- Seed instants are offsets from `ANCHOR_MS` (`minutesAgo`, `hoursAgo`, `daysAgo`) and are ISO strings; text is formatted at render by `shared/inbox/ui/format.ts`.
- Relations are ids (a contact's conversations as `{ id }`, an activity row's `ownerAgentId`); `inbox-contacts-mfe/src/shared-inbox/dataset.test.ts` checks the seed's referential integrity.
- Labels are ids resolved through the package catalogue (the dashboard's `screen/datasetLabels.ts`, chart configs), so every screen reads in its language.
- Derive what can be derived (counts, totals, deltas, percents, initials) instead of storing it.
- Seed email addresses use reserved example domains and phone numbers the `555 01xx` range.
