# Guideline: The Inbox App's Data

`src/api/` holds the app's data, and nothing else does. One service per domain: `InboxApiService` backs the chat screen and the contacts directory, which share one dataset (a contact is a conversation's contact, a thread header and a table row at once); `MailApiService` backs the mail screen with its own, unrelated dataset; `DashboardApiService` backs the dashboard with a third dataset of its own. The dashboard still reads `InboxApiService.getContacts` for the recent-activity table's contact cells, and its activity rows point at those contacts by id rather than inventing a second set of people. A new screen reads from whichever service already owns its domain; add a sibling service only when the domain does not overlap with any of the three, the way mail did not overlap with chat and contacts. Do not put content anywhere else.

```
src/api/
  InboxApiService.ts      BaseApiService + RestProtocol + RestEndpointProtocol, declares a RestMockPlugin over mocks.ts
  MailApiService.ts       the mail domain's sibling service, same primitives, its own baseURL
  DashboardApiService.ts  the dashboard domain's sibling service, same primitives, one endpoint
  RestMockPlugin.ts       the app's own mock plugin, built on @gears-frontx/api primitives, shared by every service
  queries.ts              useApiQuery / useApiMutation over the endpoint descriptors, shared by every service
  registry.ts             registerApiServices() and setMockMode() at boot, getInboxApi() / getMailApi() / getDashboardApi() everywhere else
  constants.ts            ids and fixed values the screens share with the API (CHANNEL_GENERAL, MAILBOX_SENT, BRAND, NO_TEAM_INBOX)
  seedClock.ts            the one load-time anchor every seed instant is measured from, and the transcript's calendar-text formatter
  types.ts                the inbox/contacts response contracts
  mailTypes.ts            the mail response contracts
  dashboardTypes.ts       the dashboard response contract
  mocks.ts                the inbox/contacts mock map and its mock store, keys prefixed with the /api/inbox baseURL
  mailMocks.ts            the mail mock map, keys prefixed with the /api/mail baseURL
  dashboardMocks.ts       the dashboard mock map, keys prefixed with the /api/dashboard baseURL
  dataset.ts              the inbox/contacts seed content
  mailDataset.ts          the mail seed content
  dashboardDataset.ts     the dashboard seed content
```

The seed datasets are imported by the mock maps and by the test utilities, never by a screen. A screen that needs a fixed id or value the API also knows (the channel it opens on, the mailbox a sent mail is filed under) imports it from `constants.ts`.

## Reading from a component

```ts
const service = getInboxApi();
const contactsQuery = useApiQuery(service.getContacts);
```

The mail screen reads the same way, off its own service:

```ts
const service = getMailApi();
const mailsQuery = useApiQuery(service.getMails);
```

`@gears-frontx/api` hands out endpoint *descriptors* - a stable key plus a `fetch` - and leaves caching to the consumer. `queries.ts` is that consumer: two hooks that dedupe by descriptor key, so the same endpoint read from two screens and mounted twice by StrictMode makes one request. A query result carries `data`, `error`, `isLoading` and `refetch`. A mutation names the reads it changes in `invalidates`, and those cache entries are forgotten once it succeeds, so the next screen to mount reads what the server now holds. Swapping the file for a server-state library is a change to that one file; the screens only ever see `useApiQuery` and `useApiMutation`.

A screen gates its first paint on every query that paint needs, through `firstPaintOf` in `src/shared/QueryStates.tsx`: a failed query shows `LoadErrorPane` (a kit `Alert` with a retry) and a pending one shows `LoadingPane`. A new screen does the same rather than rendering an empty state for data that never arrived.

## The mock plugin belongs to the app

`RestMockPlugin` is `src/api/RestMockPlugin.ts`, not an import from `@gears-frontx/api`: the ecosystem package publishes the plugin primitives and the `MOCK_PLUGIN` marker, and leaves the mock to whoever owns the project's data. It is shared, not per-service: `InboxApiService`, `MailApiService` and `DashboardApiService` each register their own instance over their own mock map. Registering only declares the plugin.

`setMockMode(enabled)` in `src/api/registry.ts` is the one switch. It walks every registered service's plugins (`apiRegistry.getAll()`, `getPlugins()`, `isMockPlugin`) and adds each mock plugin to its protocol or takes it off. `registerApiServices()` calls `setMockMode(true)` at boot. Passing `false` there, or dropping the call, sends every request to the backend at its service's base URL; the endpoints, the types and every screen stay as they are. A new service that registers a `RestMockPlugin` is covered by the same switch with no change to `registry.ts` beyond registering the service.

While a mock plugin is on it answers every request its protocol sends:

- a mapped `METHOD /path` answers with its factory's value as a 200, or with the status and body of a `mockReply(status, data)` the factory returns;
- an unmapped route answers 404, rather than leaking to a network the mock mode says is not there;
- a status of 400 or above rejects the call with a `MockResponseError` carrying `status` and `body`, the way an HTTP error rejects a real request;
- the configured delay (100 ms for every service here) is cut short when the request's signal aborts.

## The endpoint surface

| Endpoint | Returns |
|---|---|
| `GET /api/inbox/me` | the agent identity: name, presence, workspace |
| `GET /api/inbox/channels` | the three seeded channels with id, label, icon name, item count, open count |
| `GET /api/inbox/conversations` | every conversation across all channels |
| `GET /api/inbox/messages` | every message across every conversation, including the ones posted this session |
| `GET /api/inbox/contacts` | all 29 contacts with their full detail payload |
| `POST /api/inbox/messages` | stores a posted reply or note and answers with it, with a server-assigned id and timestamp; 400 when the body has no `conversationId` or no non-blank `body` |

`MailApiService` answers the mail screen the same read-only-collections way, off its own baseURL:

| Endpoint | Returns |
|---|---|
| `GET /api/mail/mailboxes` | the five mailboxes (Inbox, Drafts, Sent, Archive, Trash - no Spam) with id and label |
| `GET /api/mail/mails` | every mail across every mailbox |
| `GET /api/mail/messages` | every earlier message behind a mail's "N earlier messages" toggle |

The mail service has no write endpoint. A reply sent from the reading pane and a mail written in the Compose dialog are both appended to the mail screen's own state under Sent (`MAILBOX_SENT`), so they last as long as that screen does. Adding a real send is adding a `POST /api/mail/...` mutation to `MailApiService` and its mock map, the way `postMessage` exists on `InboxApiService`.

`DashboardApiService` answers the dashboard with a single response rather than one endpoint per section, because the dashboard is one coherent view, not a set of independently browsable lists the way mailboxes, mails and messages are:

| Endpoint | Returns |
|---|---|
| `GET /api/dashboard/overview` | the KPI cards, resolved per day, new contacts, the summary trend, records created, contacts by stage, workload, the stage funnel, conversion by source, top agents and the recent-activity rows, all together |

Splitting it into several endpoints is the right move only once some part of the dashboard needs to load or refresh on its own - see `InboxApiService`'s doc comment for the same call made the other way.

## Every read returns a whole collection, on purpose

`RestMockPlugin` matches exact `METHOD /path` keys and calls a factory with the request body and nothing else, so a per-id endpoint could not tell which id it was asked for. Selection therefore happens client-side, in the screen, over a collection it already holds, which also keeps search live and counters recomputing without a round trip.

A new screen follows the same rule. If it needs a slice nobody fetches today, add a collection endpoint and select from it; do not add a parameterised one.

## The mock store

The inbox transcript is the one collection a request changes. `POST /api/inbox/messages` appends the posted reply or note (`seen: null`, `internal: true` for a note) to a mock store in `mocks.ts`, and `GET /api/inbox/messages` serves that store, so a sent message is still in the thread after the screen remounts, until the page reloads. Every factory, in all three mock maps, answers with a `structuredClone` of its data, so nothing a screen does to a response reaches the store or the seed. `resetMockState()` in `registry.ts` puts every mock store back to its seed; tests call it between cases together with `apiRegistry.reset()`.

## Rules for content

- **Seed data is TypeScript, not fixture files.** Mock data is application code registered per service through `RestMockPlugin`, which is what keeps switching to a real backend a one-line change rather than a build-time choice.
- **No content baked into markup.** A subject, a name, a snippet or a count in JSX is content that cannot be changed without editing a screen. It belongs in the dataset of the service that owns the domain: `dataset.ts`, `mailDataset.ts` or `dashboardDataset.ts`.
- **Dates are offsets from one clock.** Every seed instant is measured back from `ANCHOR_MS` in `seedClock.ts` (`minutesAgo`, `hoursAgo`, `daysAgo`), so a conversation still reads "1h" and "4d" on any run day and the three datasets agree about what "an hour ago" was. Every instant in the data is an ISO string, a message's `sentAt`, a mail history entry's `sentAt` and a chart's day or month included; relative and absolute text is written at render by `src/shared/format.ts` in the app's locale. Each thread's newest message sits exactly at its conversation's last activity.
- **Derive what can be derived.** Initials, the email domain column, the qualification checklist, the filter counts, the dashboard's totals, deltas and percents, and the contact activity timeline are all computed from the records. A stored copy would be a second thing to keep in step, and the one that drifts is the one on screen.
- **Relations are ids.** A contact lists its conversations as `{ id }` references joined on the client, and a dashboard activity row names its owner by `ownerAgentId`. A reference that points at nothing is a defect; `dataset.test.ts` checks the seed's referential integrity.
- **Suggested replies are content, not a model call.** A conversation's `suggestedReplies` are authored in `dataset.ts` alongside its transcript. An empty array is the way to say a thread gets none - every spam and every snoozed conversation carries one - and the chip row disappears rather than emptying.
- **Writes.** Posting a reply or a note is the only change the services persist. Everything the details panel moves - assignee, team inbox, priority, status, tags, spam - and a channel or chat created from the conversation list are applied in screen state, because a real backend would own those. Keep that split: adding a write means adding an endpoint to the service and its mock map, not pretending in a component.
- **Fictional contact data.** Seed email addresses use reserved example domains and seed phone numbers use the `555 01xx` range. Keep it that way for any record added.
- **A mail's history is a separate collection, like a conversation's messages.** `Mail.body` is the newest message only, and `mailDataset.ts`'s `mailMessages` holds only the earlier ones, oldest first, keyed by `mailId`. Most mails have none, which is what keeps the reading pane's history toggle off their pane entirely - the same "empty is meaningful" rule `suggestedReplies` follows above.
