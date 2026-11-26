/**
 * @gears-frontx/framework/mfe — MFE runtime re-exports.
 *
 * Independent subpath for the MFE runtime surface: the re-exports from
 * `@gears-frontx/mfes` and the MFE host plugin `microfrontends()` with its
 * lifecycle/registration actions, selectors and state types. Split out of the
 * main barrel so a consumer that needs only the React/plugins surface (the
 * main barrel) does not transitively reach the MFE registry/loader/mediator,
 * and a host (the shell, a nested-host MFE) imports this subpath explicitly.
 *
 * The subpath is type-system agnostic: it depends only on the abstract
 * `TypeSystemPlugin` contract and names no concrete type system. The host
 * plugin's lifecycle actions resolve their action type IDs through the type
 * system the host passes to `microfrontends({ typeSystem })`.
 *
 * @packageDocumentation
 */

// MFE Abstract Classes (re-exported from @gears-frontx/mfes)
export {
  ChildMfeBridge,
  ParentMfeBridge,
  MfeHandler,
  MfeBridgeFactory,
  ActionHandler,
  MfeRegistry,
  MfeRegistryFactory,
  ExtensionDomainImplementationFactory,
  ExtensionDomainImplementation,
  ExtensionMounter,
  MountStrategy,
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy,
} from '@gears-frontx/mfes';

// MFE Concrete Implementations (re-exported from @gears-frontx/mfes)
export { MfeHandlerMF } from '@gears-frontx/mfes';

// MFE Utilities (re-exported from @gears-frontx/mfes)
export {
  createShadowRoot,
  injectCssVariables,
} from '@gears-frontx/mfes';

// MFE Registry singleton (app-layer composition root — see ./mfe/registry)
export { mfeRegistryFactory } from './mfe/registry';

// MFE host plugin, its actions and selectors
export {
  microfrontends,
  loadExtension,
  mountExtension,
  unmountExtension,
  registerExtension,
  unregisterExtension,
  selectExtensionState,
  selectRegisteredExtensions,
  selectExtensionError,
} from './plugins/microfrontends';

// MFE host plugin types
export type {
  MicrofrontendsConfig,
  MfeState,
  ExtensionRegistrationState,
  RegisterExtensionPayload,
  UnregisterExtensionPayload,
} from './plugins/microfrontends';

// MFE Types (re-exported from @gears-frontx/mfes)
export type {
  MfeMountContext,
  Extension,
  ExtensionDomain,
  ActionsChain,
  Action,
  SharedProperty,
  LifecycleStage,
  LifecycleHook,
  MfeEntryLifecycle,
  MfeEntry,
  MfeEntryMF,
  LoadExtPayload,
  MountExtPayload,
  UnmountExtPayload,
  MfeRegistryConfig,
  TypeSystemPlugin,
  // MF2 manifest types
  MfManifest,
  ContainerHooks,
  DomainContext,
  ActionPayload,
} from '@gears-frontx/mfes';
