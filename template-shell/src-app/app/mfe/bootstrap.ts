/**
 * MFE Bootstrap
 *
 * Registers MFE domains, extensions, and handlers with the FrontX app.
 *
 * MFE manifest configs are fetched at runtime from `/generated-mfe-manifests.json`
 * (a public asset produced by `scripts/generate-mfe-manifests.ts` before each
 * `vite dev` / `vite build`). The script accepts `--base-url` for
 * deployment-specific `publicPath` values; the JSON shape is identical to
 * what the future backend API will return so the transport swap is a
 * one-line URL change here.
 */

import {
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ExclusiveMountStrategy,
  OptionalMountStrategy,
  ActionHandler,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from '@gears-frontx/react';
import type {
  FrontXApp,
  Extension,
  ExtensionDomain,
  MfManifest,
  MfeEntryMF,
  JSONSchema,
  MfeRegistry,
  ContainerHooks,
  DomainContext,
  ActionPayload,
  MountStrategy,
} from '@gears-frontx/react';
import { entryAddressesSchema, type DomainRouting } from '@gears-frontx/frontx-template-shell';
import {
  CHROME_ACTION_SCHEMAS,
  CHROME_SET_MENU_COLLAPSED,
  CHROME_SET_THEME,
} from './chrome-actions';
import { createShellRouting, shellNavigation, type ShellNavigation, type ShellRouting } from './shell-routing';

const MFE_MANIFESTS_URL = '/generated-mfe-manifests.json';

/**
 * Shape of each MFE manifest config in the generated JSON.
 * Matches the output of scripts/generate-mfe-manifests.ts. `extensions` is
 * optional because an MFE may declare only loadable entries (with no
 * default wiring); the consumer chooses how those entries get wired into
 * domains. Self-declared `extensions[]` are still supported for MFEs that
 * propose default wirings the host should pick up. `domains` is optional
 * because most MFEs target host-owned domains; an MFE declares `domains`
 * only when it owns an ExtensionDomain instance (e.g., demo-mfe owns the
 * widgets domain — registered here so extensions targeting that domain
 * resolve content-addressed at the runtime store).
 */
interface MfeManifestConfig {
  manifest: MfManifest;
  domains?: ExtensionDomain[];
  entries: MfeEntryMF[];
  extensions?: Extension[];
  schemas?: JSONSchema[];
}

// ─── Domain implementation building blocks ───────────────────────────────────
//
// The redesigned domain model owns mount semantics inside the domain
// implementation. Each domain registered with the registry pairs an
// `ExtensionDomain` declaration with an `ExtensionDomainImplementationFactory`
// whose `build(ctx)` constructs an `ExtensionDomainImplementation`. The
// implementation captures the per-domain mounter and a `ContainerHooks`
// inside its chosen `MountStrategy` and registers per-action-type handlers
// that delegate to the strategy.

class HostContainerHooks implements ContainerHooks {
  private readonly elements = new Map<string, HTMLElement>();

  create(extensionId: string): Element {
    const el = document.createElement('div');
    el.dataset.extensionId = extensionId;
    el.style.height = '100%';
    this.elements.set(extensionId, el);
    return el;
  }

  destroy(extensionId: string): void {
    this.elements.delete(extensionId);
  }
}

// The two readers below state, to TypeScript, an invariant the type system
// already enforces at runtime: `chrome-actions.ts` closes each chrome payload
// around a single required field of a declared type, and the mediator validates
// an action against that schema before it resolves any handler for it. So a
// handler never sees a payload missing its field, and neither reader is a
// refusal path a caller can trigger — reaching a throw means the schema and the
// handler disagree about the payload, which is a defect in one of the two.

function readThemeId(payload: Record<string, unknown> | undefined): string {
  const themeId = payload?.themeId;
  if (typeof themeId !== 'string') {
    throw new Error(
      '[MFE Bootstrap] set_theme payload has no string themeId; the action schema should have refused this action before it reached the handler',
    );
  }
  return themeId;
}

function readCollapsed(payload: Record<string, unknown> | undefined): boolean {
  const collapsed = payload?.collapsed;
  if (typeof collapsed !== 'boolean') {
    throw new Error(
      '[MFE Bootstrap] set_menu_collapsed payload has no boolean collapsed; the action schema should have refused this action before it reached the handler',
    );
  }
  return collapsed;
}

class ScreenDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ExclusiveMountStrategy;

  constructor(
    ctx: DomainContext,
    hooks: ContainerHooks,
    registry: MfeRegistry,
    domainId: string,
    app: FrontXApp,
    private readonly routing: DomainRouting,
  ) {
    super();
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, hooks, registry, domainId);
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        const payload = p as ActionPayload;
        await this.strategy.mount(payload);
        // Before this handler settles, so a chained `next` sees the entry in the URL (D3).
        this.routing.afterMount(payload.subject);
      }),
    );
    // The host chrome a mounted screen may drive. The one thing neither the
    // action schema nor the domain declaration can decide is whether THIS host
    // runs the plugin the action needs — `themes` and `layout` are both opt-in
    // — so each handler resolves rather than throws when it does not: chrome is
    // decoration around a screen, and a request the shell cannot honour should
    // leave the screen running instead of failing its chain.
    ctx.registerHandler(
      CHROME_SET_THEME,
      ActionHandler.fromFunction((_t, p) => {
        if (typeof app.actions.changeTheme !== 'function') {
          console.warn('[MFE Bootstrap] set_theme ignored: no themes plugin on this host');
        } else {
          app.actions.changeTheme({ themeId: readThemeId(p) });
        }
        return Promise.resolve();
      }),
    );
    ctx.registerHandler(
      CHROME_SET_MENU_COLLAPSED,
      ActionHandler.fromFunction((_t, p) => {
        if (typeof app.actions.toggleMenuCollapsed !== 'function') {
          console.warn('[MFE Bootstrap] set_menu_collapsed ignored: no layout plugin on this host');
        } else {
          app.actions.toggleMenuCollapsed({ collapsed: readCollapsed(p) });
        }
        return Promise.resolve();
      }),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class OptionalDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: OptionalMountStrategy;

  constructor(
    ctx: DomainContext,
    hooks: ContainerHooks,
    registry: MfeRegistry,
    domainId: string,
    private readonly routing: DomainRouting,
  ) {
    super();
    this.strategy = new OptionalMountStrategy(ctx.mounter, hooks, registry, domainId);
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        const payload = p as ActionPayload;
        await this.strategy.mount(payload);
        this.routing.afterMount(payload.subject);
      }),
    );
    ctx.registerHandler(
      FRONTX_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        const payload = p as ActionPayload;
        await this.strategy.unmount!(payload);
        this.routing.afterUnmount(payload.subject);
      }),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ScreenDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(
    private readonly registry: MfeRegistry,
    private readonly app: FrontXApp,
    private readonly routing: DomainRouting,
  ) { super(); }
  build(ctx: DomainContext): ScreenDomainImpl {
    return new ScreenDomainImpl(
      ctx,
      new HostContainerHooks(),
      this.registry,
      screenDomain.id,
      this.app,
      this.routing,
    );
  }
}

class OptionalDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(
    private readonly registry: MfeRegistry,
    private readonly domainId: string,
    private readonly routing: DomainRouting,
  ) { super(); }
  build(ctx: DomainContext): OptionalDomainImpl {
    return new OptionalDomainImpl(ctx, new HostContainerHooks(), this.registry, this.domainId, this.routing);
  }
}

/**
 * Scoped schema registration: only register schemas whose $id matches an action ID
 * declared by at least one entry in this package. Action schemas are validated
 * against declared entry actions; non-action schemas (derived ExtensionDomain
 * and Extension type schemas owned by parent MFEs) are registered separately
 * via `registerNonActionSchemas` because they have no action ID counterpart.
 */
function collectDeclaredActionIds(entries: MfeEntryMF[]): Set<string> {
  const declaredActionIds = new Set<string>();
  for (const entry of entries) {
    for (const actionId of entry.actions) declaredActionIds.add(actionId);
    for (const actionId of entry.domainActions) declaredActionIds.add(actionId);
  }
  return declaredActionIds;
}

function registerScopedSchemas(
  registry: MfeRegistry,
  schemas: JSONSchema[],
  declaredActionIds: Set<string>,
): void {
  for (const schema of schemas) {
    const schemaId = schema.$id;
    if (!schemaId) continue;
    const matches = Array.from(declaredActionIds).some((actionId) =>
      schemaId.includes(actionId),
    );
    if (matches) {
      registry.typeSystem.registerSchema(schema);
    }
  }
}

/**
 * Register schemas that are not action schemas. Derived `ExtensionDomain` and
 * `Extension` type schemas declared by a parent MFE (e.g., demo-mfe's widgets
 * domain derived schema) must be registered before any leaf MFE's extension
 * instance is validated against the chain — per
 * `cpt-frontx-dod-mfe-registry-mfe-schema-registration` (parent
 * registers schemas before entries / extensions). The action-id-match filter
 * in `registerScopedSchemas` does not apply to these schemas because their
 * `$id` is a domain or extension type ID, not an action ID.
 *
 * Registration is idempotent: `gtsPlugin.registerSchema` accepts duplicates,
 * so registering all non-action schemas across all packages in a first pass
 * is safe and keeps the schema chain available before any leaf-MFE extension
 * registration.
 */
function registerNonActionSchemas(
  registry: MfeRegistry,
  schemas: JSONSchema[],
  declaredActionIds: Set<string>,
): void {
  for (const schema of schemas) {
    const schemaId = schema.$id;
    if (!schemaId) continue;
    const matchesAction = Array.from(declaredActionIds).some((actionId) =>
      schemaId.includes(actionId),
    );
    if (!matchesAction) {
      registry.typeSystem.registerSchema(schema);
    }
  }
}

/**
 * First pass over every package: register all non-action schemas on the gts
 * singleton so leaf-MFE extension validation later in the second pass can chain
 * through derived schemas declared by parent MFEs (regardless of iteration
 * order in `generated-mfe-manifests.json`).
 */
function registerAllNonActionSchemas(
  registry: MfeRegistry,
  manifests: readonly MfeManifestConfig[],
): void {
  for (const config of manifests) {
    if (!config.schemas) continue;
    registerNonActionSchemas(
      registry,
      config.schemas,
      collectDeclaredActionIds(config.entries),
    );
  }
}

/**
 * Returns true when the given domain ID is registered on the host registry —
 * i.e., this host owns the domain and is responsible for registering its
 * extensions. Foreign-domain extensions (those whose target domain is owned by
 * a different runtime, like the widgets domain owned by demo-mfe's child
 * FrontX app) MUST NOT be registered on the host registry; they reach their
 * owning runtime through a content-addressed dispatcher (per Phase 2.6 —
 * `cpt-frontx-algo-framework-composition-content-addressed-discovery`).
 */
function hostOwnsDomain(registry: MfeRegistry, domainId: string): boolean {
  return registry.getDomain(domainId) !== undefined;
}

async function registerMfePackage(
  registry: MfeRegistry,
  config: MfeManifestConfig,
  routing: ShellRouting,
): Promise<void> {
  if (config.schemas) {
    registerScopedSchemas(registry, config.schemas, collectDeclaredActionIds(config.entries));
  }
  // register() validates each instance against its schema and throws on
  // failure — invalid manifests/entries fail startup loudly rather than
  // persisting broken state into the registry. The aggregator script inlines
  // the resolved MfManifest object into each entry's `manifest` field so the
  // host registers entries opaquely — no spread/override needed here.
  registry.typeSystem.register(config.manifest);
  // Registration order: schemas → manifest → domains → entries → extensions.
  // Domains MUST be registered before any extension references them so the
  // content-addressed dispatcher can resolve target-domain ownership at the
  // GTS runtime store. Domain registration is opaque — the aggregator passes
  // each `ExtensionDomain` instance through verbatim.
  for (const domain of config.domains ?? []) {
    console.info(`[MFE Bootstrap] Registering domain ${domain.id}`);
    registry.typeSystem.register(domain);
  }
  for (const entry of config.entries) {
    registry.typeSystem.register(entry);
  }
  for (const extension of config.extensions ?? []) {
    // Phase 2.6 content-addressed discovery: only register extensions whose
    // target domain is owned by this host registry. Extensions targeting a
    // domain owned by another FrontX app (e.g., widgets-fixture-a's two widget
    // extensions target the widgets domain owned by demo-mfe's child app) are
    // skipped here and dispatched to the owning runtime by L4 inline code in
    // that runtime's bootstrap. When the framework `microfrontends()` plugin's
    // content-addressed dispatcher lands (post-Phase 2.6 implementation), this
    // skip-and-defer rule moves into L2 and the host bootstrap becomes a pure
    // GTS-runtime-store registrar.
    if (!hostOwnsDomain(registry, extension.domain)) {
      // This host doesn't own the target domain, so it must not admit/mount
      // this extension — but it still needs the declaration present on its
      // own type system: each `GtsPlugin` instance owns an independent
      // GtsStore (plugin.ts), and `x-gts-ref` admission validation for an
      // action originating here (e.g. Hello World's ping dispatched at the
      // shell's own registry, escalating down to widget-a two hops away)
      // checks referenced entities against THIS store, before the action
      // ever reaches cross-hop routing. Registering opaquely here (no
      // `registerExtension`/mounting) mirrors the widgets-host's own
      // registration of foreign-domain entities in
      // `bootstrapWidgetsRuntime`.
      registry.typeSystem.register(extension);
      continue;
    }
    await registry.registerExtension(extension);
    // The extension's entry address must reach the entry-addresses shared
    // property before anything (Menu, a deep link) can ask this host to
    // mount it — re-broadcasting after every registration, rather than once
    // at the end, is what keeps that ordering (D1/D2). This makes
    // `buildEntryAddresses` (which walks every routable extension of every
    // domain) run once per registered extension across the whole bootstrap —
    // O(n²) in the total extension count. Acceptable at template scale (a
    // handful of MFEs); a host with a large, dynamic extension set would want
    // a debounced or dirty-flagged broadcast instead.
    //
    // A broadcast failure here must not fail the whole registration pass —
    // `registerExtension` above is what stays all-or-nothing (a malformed
    // manifest should still abort startup loudly); the property is a
    // courtesy re-announcement, and `bootstrapMFE`'s final broadcast after
    // this loop recovers the correct value even if one round here was lost.
    try {
      routing.broadcastAddresses();
    } catch (error) {
      console.error(`[MFE Bootstrap] broadcastAddresses failed after registering ${extension.id}`, error);
    }
  }
}

/**
 * Bootstrap MFE system for the host application.
 *
 * Registers the chrome action schemas and `entryAddressesSchema` on the
 * registry's type system first (the four base domains' declarations
 * reference the latter by `x-gts-ref`), then synchronously registers the
 * four well-known domains (screen, sidebar, popup, overlay) with their
 * per-domain implementation factories and broadcasts entry addresses once
 * they are all in — safe this early since nothing can mount yet. It then
 * broadcasts the initial shared properties (theme, language) and
 * asynchronously registers the extensions declared in
 * `generated-mfe-manifests.json`, broadcasting entry addresses again after
 * every extension registers (so a caller asking to mount one, e.g. Menu or a
 * deep link, sees it as soon as it lands rather than only once every package
 * has registered) and once more after the whole loop — that final broadcast
 * is the clean, authoritative one even if an intermediate round above was
 * caught and logged rather than propagated.
 *
 * Mount/unmount lifecycle is not driven here: the `ShellRouting` this call
 * returns is only started/stopped through its consumer's `onAttached`/
 * `onDetached` (MfeScreenContainer's `<ExtensionDomainSlot>` calls
 * `routing.screen.start()`/`.stop()` there, and any other host-rendered slot
 * would do the same for its own domain) — this function itself never calls
 * `start()` or `stop()` on the routing it builds.
 *
 * Returns the `ShellRouting` this call created: the caller starts its four
 * observers once discovery has settled (bootstrap resolved and the screen
 * slot's root attached, D4) and passes it to `<ExtensionDomainSlot>`.
 *
 * @param app - FrontX application instance
 * @param nav - the shell's navigation history and route signal; defaults to
 *   the process-wide singleton (`shellNavigation()`) so callers other than
 *   tests never need to pass this.
 */
export async function bootstrapMFE(app: FrontXApp, nav: ShellNavigation = shellNavigation()): Promise<ShellRouting> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }

  // The chrome action schemas must be on the type system before any action
  // carrying one of these types can be dispatched, and `registerDomain` is the
  // first thing a mounted screen can act against. `entryAddressesSchema` joins
  // them here for the same reason: the four base domains' declarations
  // reference it by `x-gts-ref` in `sharedProperties`, so it must be
  // registered before the first `registerDomain` call below. Registration is
  // idempotent, so calling it here is safe no matter how many times this
  // function runs against the same registry — but it says nothing about any
  // OTHER registry: each `GtsPlugin` instance owns an independent GtsStore, so
  // a nested runtime that also registers `screenDomain` directly (e.g.
  // demo-mfe's `lifecycle-widgets-host.tsx`) needs its own copy of this
  // registration against its own store, not this one.
  for (const schema of CHROME_ACTION_SCHEMAS) {
    registry.typeSystem.registerSchema(schema);
  }
  registry.typeSystem.registerSchema(entryAddressesSchema);

  const routing = createShellRouting(registry, nav);

  // The shipped `screenDomain` is spread rather than edited: the framework
  // declaration stays the default every template gets, and this shell opts
  // itself into the two chrome actions its handlers above answer. The
  // declaration's `extensionsActions` is deliberately untouched - listing them
  // there would make them mandatory for every screen extension in the repo.
  registry.registerDomain(
    { ...screenDomain, actions: [...screenDomain.actions, CHROME_SET_THEME, CHROME_SET_MENU_COLLAPSED] },
    new ScreenDomainFactory(registry, app, routing.screen),
  );
  registry.registerDomain(sidebarDomain, new OptionalDomainFactory(registry, sidebarDomain.id, routing.sidebar));
  registry.registerDomain(popupDomain, new OptionalDomainFactory(registry, popupDomain.id, routing.popup));
  registry.registerDomain(overlayDomain, new OptionalDomainFactory(registry, overlayDomain.id, routing.overlay));
  // The four domains are registered (empty of extensions so far) — safe to
  // broadcast now, before anything can mount.
  routing.broadcastAddresses();

  const currentThemeId = app.themeRegistry?.getCurrent()?.id ?? 'default';
  registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, currentThemeId);
  const derivedLanguage = app.i18nRegistry.getLanguage();
  registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, derivedLanguage ?? 'en');

  console.info(`[MFE Bootstrap] Fetching MFE manifests from ${MFE_MANIFESTS_URL}`);
  const response = await fetch(MFE_MANIFESTS_URL);
  if (!response.ok) {
    throw new Error(
      `[MFE Bootstrap] Failed to load MFE manifests from ${MFE_MANIFESTS_URL}: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  if (manifests.length === 0) {
    console.warn(
      '[MFE Bootstrap] No MFE manifests found. Run `npm run generate:mfe-manifests` to generate them.',
    );
    return routing;
  }
  // First pass: register every package's non-action schemas (derived
  // ExtensionDomain / Extension type schemas) so leaf-MFE extension validation
  // in the second pass can chain through them regardless of manifest order.
  registerAllNonActionSchemas(registry, manifests);
  for (const config of manifests) {
    await registerMfePackage(registry, config, routing);
  }
  // Guarantees the entry-addresses property reflects every successfully
  // registered extension even if an intermediate re-announcement inside
  // `registerMfePackage` above was caught and logged rather than propagated
  // (C2) — the last word on this property is always a clean broadcast of
  // the registry's actual current state.
  try {
    routing.broadcastAddresses();
  } catch (error) {
    console.error('[MFE Bootstrap] final broadcastAddresses failed', error);
  }
  return routing;
}
