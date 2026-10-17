/**
 * MFE Bootstrap
 *
 * Registers MFE domains, extensions, and handlers with the FrontX app.
 *
 * MFE manifest configs are fetched at runtime from `generated-mfe-manifests.json`
 * in the shell's own folder (`manifestsUrl`), a public asset produced by
 * `scripts/generate-mfe-manifests.ts` before each `vite dev` / `vite build`. The
 * JSON shape is identical to what the future backend API will return so the
 * transport swap is a one-line URL change here.
 *
 * A screen's `publicPath` in the file may be relative: the production layout
 * (`scripts/layout-dist.ts`) writes `mfe/<package>/`. The MFE handler resolves
 * it against the document, which the shell is served as from its own folder,
 * the folder the file sits in. The entries are registered exactly as the file
 * carries them, so every runtime that registers them from the same file (a
 * nested app's own bootstrap included) registers the same content.
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
import {
  CHROME_ACTION_SCHEMAS,
  CHROME_SET_MENU_COLLAPSED,
  CHROME_SET_THEME,
} from './chrome-actions';
import { readHistoryIntent, screenLoadFailure } from './screenLoadFailure';
import { screenState } from './screenState';

const MFE_MANIFESTS_FILE = 'generated-mfe-manifests.json';

/**
 * Where the manifest aggregate is served: in the shell's own folder.
 *
 * A build with a relative base (`./`, the production build) resolves it
 * against this module's own address rather than the document's: the document
 * can sit at any address the hosting answers with `index.html`, while every
 * built module lives in the shell's `assets/` folder (`build.assetsDir` in
 * vite.config.ts), one level below the aggregate. An absolute base (the dev
 * server's `/`) is used as it is.
 *
 * @param base - The build's base (`import.meta.env.BASE_URL`)
 * @param moduleUrl - The address of the module asking (`import.meta.url`)
 */
export function manifestsUrl(base: string, moduleUrl: string): string {
  if (base === '' || base.startsWith('.')) {
    return new URL(`../${MFE_MANIFESTS_FILE}`, moduleUrl).href;
  }
  return new URL(`${base.endsWith('/') ? base : `${base}/`}${MFE_MANIFESTS_FILE}`, moduleUrl).href;
}

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

  destroy(extensionId: string, container?: Element): void {
    if (!container || this.elements.get(extensionId) === container) {
      this.elements.delete(extensionId);
    }
  }
}

/** The screen domain's hooks: the shell's mounted-screen state follows the container of the screen the strategy holds. */
class ScreenContainerHooks extends HostContainerHooks {
  override create(extensionId: string): Element {
    const el = super.create(extensionId);
    screenState.set(extensionId);
    return el;
  }

  override destroy(extensionId: string, container?: Element): void {
    super.destroy(extensionId, container);
    if (screenState.getSnapshot() === extensionId) screenState.set(undefined);
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
  private latestMount = 0;

  constructor(
    ctx: DomainContext,
    hooks: ContainerHooks,
    app: FrontXApp,
  ) {
    super();
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, hooks);
    // The runtime's `reflect` commands to the router of
    // `@gears-frontx/routing`, which the framework injects into the registry,
    // write this mount into the URL — no domain-implementation call is needed
    // for it. An Exclusive domain
    // declares and registers no `unmount_ext`: a screen leaves through a
    // replacing `mount_ext`.
    // A new mount drops the report of the one before it; a failed mount is
    // reported for the screen container's error state and still fails the
    // action. Only the latest mount, started in the current visit, reports, so
    // a mount failing late never shows its error over a newer screen or after a
    // history step left its address.
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        const mount = ++this.latestMount;
        const visit = screenLoadFailure.visit();
        screenLoadFailure.clear();
        try {
          await this.strategy.mount(p as ActionPayload);
        } catch (error) {
          const subject = p?.subject;
          if (mount === this.latestMount && typeof subject === 'string') {
            screenLoadFailure.report(subject, readHistoryIntent(p), visit);
          }
          throw error;
        }
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

  constructor(ctx: DomainContext, hooks: ContainerHooks) {
    super();
    this.strategy = new OptionalMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      FRONTX_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        await this.strategy.mount(p as ActionPayload);
      }),
    );
    ctx.registerHandler(
      FRONTX_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(async (_t, p) => {
        await this.strategy.unmount(p as ActionPayload);
      }),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ScreenDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly app: FrontXApp) { super(); }
  build(ctx: DomainContext): ScreenDomainImpl {
    return new ScreenDomainImpl(ctx, new ScreenContainerHooks(), this.app);
  }
}

class OptionalDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): OptionalDomainImpl {
    return new OptionalDomainImpl(ctx, new HostContainerHooks());
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

const GTS_SCHEMA_ID_PREFIX = 'gts://';

/** A schema's `$id` is its type id behind the `gts://` prefix, so it is an action schema exactly when that type id is a declared action id. */
function isDeclaredActionSchema(schemaId: string, declaredActionIds: ReadonlySet<string>): boolean {
  return schemaId.startsWith(GTS_SCHEMA_ID_PREFIX) && declaredActionIds.has(schemaId.slice(GTS_SCHEMA_ID_PREFIX.length));
}

function registerScopedSchemas(
  registry: MfeRegistry,
  schemas: JSONSchema[],
  declaredActionIds: Set<string>,
): void {
  for (const schema of schemas) {
    const schemaId = schema.$id;
    if (!schemaId) continue;
    if (isDeclaredActionSchema(schemaId, declaredActionIds)) {
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
 * `gtsPlugin.registerSchema` accepts a schema registered twice, so
 * registering all non-action schemas across all packages in a first pass
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
    if (!isDeclaredActionSchema(schemaId, declaredActionIds)) {
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
 * owning runtime through a content-addressed dispatcher (see
 * `cpt-frontx-algo-framework-composition-content-addressed-discovery`).
 */
function hostOwnsDomain(registry: MfeRegistry, domainId: string): boolean {
  return registry.getDomain(domainId) !== undefined;
}

async function registerMfePackage(
  registry: MfeRegistry,
  config: MfeManifestConfig,
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
    // Only extensions whose target domain is owned by this host registry are
    // registered here. Extensions targeting a domain owned by another FrontX
    // app (e.g., widgets-fixture-a's two widget extensions target the widgets
    // domain owned by demo-mfe's child app) are dispatched to the owning
    // runtime by that runtime's own bootstrap.
    if (!hostOwnsDomain(registry, extension.domain)) {
      // This host doesn't own the target domain, so it must not admit/mount
      // this extension — but it still needs the declaration present on its
      // own type system: a registry's type system is not
      // guaranteed to share the realm store (an isolated `GtsPlugin` does
      // not), and `x-gts-ref` admission validation for an
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
    // The extension's own entry address, if it declares a route, is
    // supplied automatically at mount through the router's occupant value —
    // no shared-property broadcast to keep in step with registration.
  }
}

/**
 * Bootstrap MFE system for the host application.
 *
 * Registers the chrome action schemas on the registry's type system first,
 * then synchronously registers the four well-known domains (screen, sidebar,
 * popup, overlay). The registry admits each routed domain to the router of
 * `@gears-frontx/routing` that the framework injects into it, and starts and
 * stops the domain when its root attaches and detaches; this function builds
 * no routing wiring. It then broadcasts the initial shared properties
 * (theme, language) and asynchronously registers the extensions declared in
 * `generated-mfe-manifests.json`.
 *
 * Mount/unmount lifecycle is not driven here.
 *
 * @param app - FrontX application instance
 */
export async function bootstrapMFE(app: FrontXApp): Promise<void> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }

  // The chrome action schemas must be on the type system before any action
  // carrying one of these types can be dispatched, and `registerDomain` is the
  // first thing a mounted screen can act against.
  for (const schema of CHROME_ACTION_SCHEMAS) {
    registry.typeSystem.registerSchema(schema);
  }

  // The shipped `screenDomain` is spread rather than edited: the framework
  // declaration stays the default every template gets, and this shell opts
  // itself into the two chrome actions its handlers above answer. The
  // declaration's `extensionsActions` is deliberately untouched - listing them
  // there would make them mandatory for every screen extension in the repo.
  registry.registerDomain(
    { ...screenDomain, actions: [...screenDomain.actions, CHROME_SET_THEME, CHROME_SET_MENU_COLLAPSED] },
    new ScreenDomainFactory(app),
  );
  registry.registerDomain(sidebarDomain, new OptionalDomainFactory());
  registry.registerDomain(popupDomain, new OptionalDomainFactory());
  registry.registerDomain(overlayDomain, new OptionalDomainFactory());

  const currentThemeId = app.themeRegistry?.getCurrent()?.id ?? 'default';
  registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, currentThemeId);
  const derivedLanguage = app.i18nRegistry.getLanguage();
  registry.updateSharedProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, derivedLanguage ?? 'en');

  const aggregateUrl = manifestsUrl(import.meta.env.BASE_URL, import.meta.url);
  console.info(`[MFE Bootstrap] Fetching MFE manifests from ${aggregateUrl}`);
  const response = await fetch(aggregateUrl);
  if (!response.ok) {
    throw new Error(
      `[MFE Bootstrap] Failed to load MFE manifests from ${aggregateUrl}: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  if (manifests.length === 0) {
    console.warn(
      '[MFE Bootstrap] No MFE manifests found. Run `npm run generate:mfe-manifests` to generate them.',
    );
    return;
  }
  // First pass: register every package's non-action schemas (derived
  // ExtensionDomain / Extension type schemas) so leaf-MFE extension validation
  // in the second pass can chain through them regardless of manifest order.
  registerAllNonActionSchemas(registry, manifests);
  for (const config of manifests) {
    await registerMfePackage(registry, config);
  }
}
