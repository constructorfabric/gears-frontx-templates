/**
 * @gears-frontx/react/mfe — MFE React bindings and MFE runtime re-exports.
 *
 * Independent subpath for the MFE surface of this package: the MFE context,
 * hooks and components defined here, plus the MFE runtime and the MFE host
 * plugin `microfrontends()` (with its actions, selectors and state types) this
 * package re-exports from `@gears-frontx/framework/mfe`. Split out of the main
 * barrel so a consumer that needs only the React bindings (the main barrel)
 * does not transitively reach the MFE registry/loader/mediator, and a consumer
 * that uses the MFE surface imports this subpath explicitly.
 *
 * The subpath is type-system agnostic: it depends only on the abstract
 * `TypeSystemPlugin` contract and names no concrete type system.
 *
 * @packageDocumentation
 */

// ============================================================================
// MFE Context and Hooks
// ============================================================================

export { MfeContext, useMfeContext, type MfeContextValue } from './mfe/MfeContext';
export { MfeProvider, type MfeProviderProps } from './mfe/MfeProvider';
export {
  useMfeBridge,
  useSharedProperty,
  type UseSharedPropertyOptions,
  useHostAction,
  useMfeRegistry,
  useDomainExtensions,
} from './mfe/hooks';
export { ThemeAwareReactLifecycle } from './mfe/ThemeAwareReactLifecycle';
export {
  ExtensionDomainSlot,
  type ExtensionDomainSlotProps,
} from './mfe/components/ExtensionDomainSlot';

// ============================================================================
// MFE Runtime Re-exports from @gears-frontx/framework/mfe
// ============================================================================

// MFE Types
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
} from '@gears-frontx/framework/mfe';

// MFE Abstract classes
export {
  ChildMfeBridge,
  ParentMfeBridge,
  MfeHandler,
  MfeBridgeFactory,
  MfeRegistry,
  MfeRegistryFactory,
  mfeRegistryFactory,
  ActionHandler,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ExtensionMounter,
  MountStrategy,
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy,
} from '@gears-frontx/framework/mfe';

// MFE Concrete implementations
export { MfeHandlerMF } from '@gears-frontx/framework/mfe';

// MFE Utilities
export {
  createShadowRoot,
  injectCssVariables,
} from '@gears-frontx/framework/mfe';

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
} from '@gears-frontx/framework/mfe';

// MFE host plugin types
export type {
  MfeState,
  ExtensionRegistrationState,
  RegisterExtensionPayload,
  UnregisterExtensionPayload,
} from '@gears-frontx/framework/mfe';
