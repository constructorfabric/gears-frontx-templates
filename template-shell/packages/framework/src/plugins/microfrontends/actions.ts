/**
 * MFE Actions
 *
 * Action functions for MFE lifecycle and registration operations.
 * Lifecycle actions call executeActionsChain() directly (fire-and-forget).
 * Registration actions emit events that MFE effects handle.
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1
// @cpt-flow:cpt-frontx-flow-framework-composition-mfe-registration:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-mfe-plugin:p1

import { eventBus } from '@gears-frontx/state';
import { MfeEvents } from './constants';
import { type Extension, type MfeRegistry } from '@gears-frontx/mfes';
// FRONTX_ACTION_* moved to @gears-frontx/gts-plugin — see base-domains.ts.
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/gts-plugin';

// ============================================================================
// Module-Level Registry Reference
// ============================================================================

let mfeRegistry: MfeRegistry | null = null;
let registryInitializer: (() => MfeRegistry) | null = null;

/**
 * Record the MFE-enabled MfeRegistry the lifecycle actions operate on.
 * Called by the microfrontends plugin's registry initializer when it builds
 * the registry.
 */
export function setMfeRegistry(registry: MfeRegistry): void {
  mfeRegistry = registry;
}

/**
 * Bind the plugin's lazy registry initializer. Registry-dependent actions go
 * through it, so the first action call builds the registry when nothing else
 * has.
 */
export function bindMfeRegistryInitializer(initializer: () => MfeRegistry): void {
  registryInitializer = initializer;
}

function requireRegistry(): MfeRegistry {
  if (mfeRegistry) return mfeRegistry;
  if (registryInitializer) return registryInitializer();
  throw new Error('MFE registry not initialized. The microfrontends plugin must be built before using lifecycle actions.');
}

/**
 * Helper to resolve domain ID for an extension.
 */
function resolveDomainId(registry: MfeRegistry, extensionId: string): string {
  const extension = registry.getExtension(extensionId);
  if (!extension) {
    throw new Error(`Extension '${extensionId}' is not registered. Register it before calling lifecycle actions.`);
  }
  return extension.domain;
}

// ============================================================================
// Event Payload Types (Registration Events Only)
// ============================================================================

/** Payload for register extension event */
export interface RegisterExtensionPayload {
  extension: Extension;
}

/** Payload for unregister extension event */
export interface UnregisterExtensionPayload {
  extensionId: string;
}

// ============================================================================
// Module Augmentation for Type-Safe Events
// ============================================================================

declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'mfe/registerExtensionRequested': RegisterExtensionPayload;
    'mfe/unregisterExtensionRequested': UnregisterExtensionPayload;
  }
}

// ============================================================================
// Lifecycle Action Functions
// ============================================================================

/**
 * Run a fire-and-forget executeActionsChain call, logging every failure
 * mode through `onError` instead of letting any of them escape.
 *
 * `executeActionsChain` is typed as returning `Promise<void>`, but after
 * #648 the registry may throw synchronously, resolve to a non-promise, or
 * return a promise that rejects. This package sits below
 * `template-shell/packages/react` in the layer rules (framework -> react),
 * so it cannot import the shared guard from `useHostAction.ts`; this mirrors
 * that guard's semantics locally instead.
 */
function runActionsChain(run: () => unknown, onError: (error: unknown) => void): void {
  try {
    const result: unknown = run();
    const isThenable =
      typeof result === 'object' && result !== null && typeof (result as { then?: unknown }).then === 'function';
    if (isThenable) {
      Promise.resolve(result as PromiseLike<void>).catch(onError);
    }
  } catch (error) {
    onError(error);
  }
}

/**
 * Load an MFE extension bundle.
 * Calls executeActionsChain() directly (fire-and-forget).
 *
 * @param extensionId - Extension to load
 *
 * @example
 * ```typescript
 * import { loadExtension } from '@gears-frontx/framework';
 * loadExtension('gts.frontx.mfes.ext.extension.v1~my.extension.v1');
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-1
export function loadExtension(extensionId: string): void {
  const registry = requireRegistry();
  const domainId = resolveDomainId(registry, extensionId);

  // Call executeActionsChain fire-and-forget (no await)
  runActionsChain(
    () =>
      registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_LOAD_EXT,
          target: domainId,
          payload: { subject: extensionId },
        },
      }),
    (error) => {
      console.error(`[MFE] Load failed for ${extensionId}:`, error);
    }
  );
}
// @cpt-end:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-1

/**
 * Mount an MFE extension.
 * Auto-loads the extension if not already loaded.
 * The container is provided by the domain's ContainerProvider (registered at domain registration time).
 * Calls executeActionsChain() directly (fire-and-forget).
 *
 * @param extensionId - Extension to mount
 *
 * @example
 * ```typescript
 * import { mountExtension } from '@gears-frontx/framework';
 * mountExtension('gts.frontx.mfes.ext.extension.v1~my.extension.v1');
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-2
export function mountExtension(extensionId: string): void {
  const registry = requireRegistry();
  const domainId = resolveDomainId(registry, extensionId);

  // Call executeActionsChain fire-and-forget (no await)
  runActionsChain(
    () =>
      registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: domainId,
          payload: { subject: extensionId },
        },
      }),
    (error) => {
      console.error(`[MFE] Mount failed for ${extensionId}:`, error);
    }
  );
}
// @cpt-end:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-2

/**
 * Unmount an MFE extension from its container.
 * Calls executeActionsChain() directly (fire-and-forget).
 *
 * @param extensionId - Extension to unmount
 *
 * @example
 * ```typescript
 * import { unmountExtension } from '@gears-frontx/framework';
 * unmountExtension('gts.frontx.mfes.ext.extension.v1~my.extension.v1');
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-3
export function unmountExtension(extensionId: string): void {
  const registry = requireRegistry();
  const domainId = resolveDomainId(registry, extensionId);
  const domain = registry.getDomain(domainId);
  if (domain === undefined) {
    throw new Error(
      `MFE unmount failed: domain '${domainId}' is not registered (extension '${extensionId}'). Register the domain before unmounting.`
    );
  }
  const supportsUnmount = domain.actions.includes(FRONTX_ACTION_UNMOUNT_EXT);

  if (!supportsUnmount) {
    console.warn(
      `[MFE] Skipping unmount for ${extensionId}: domain '${domainId}' uses swap semantics and does not support ${FRONTX_ACTION_UNMOUNT_EXT}.`
    );
    return;
  }

  // Call executeActionsChain fire-and-forget (no await)
  runActionsChain(
    () =>
      registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: domainId,
          payload: { subject: extensionId },
        },
      }),
    (error) => {
      console.error(`[MFE] Unmount failed for ${extensionId}:`, error);
    }
  );
}
// @cpt-end:cpt-frontx-flow-framework-composition-mfe-lifecycle:p1:inst-3

/**
 * Register an extension dynamically at runtime.
 * Emits event that MFE effects handle via runtime.registerExtension().
 *
 * @param extension - Extension instance to register
 *
 * @example
 * ```typescript
 * import { registerExtension } from '@gears-frontx/framework';
 * const extension: Extension = {
 *   id: 'gts.frontx.mfes.ext.extension.v1~my.extension.v1',
 *   domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',
 *   entry: 'gts.frontx.mfes.mfe.entry.v1~my.entry.v1',
 * };
 * registerExtension(extension);
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-mfe-registration:p1:inst-1
export function registerExtension(extension: Extension): void {
  eventBus.emit(MfeEvents.RegisterExtensionRequested, { extension });
}
// @cpt-end:cpt-frontx-flow-framework-composition-mfe-registration:p1:inst-1

/**
 * Unregister an extension dynamically at runtime.
 * Emits event that MFE effects handle via runtime.unregisterExtension().
 *
 * @param extensionId - Extension ID to unregister
 *
 * @example
 * ```typescript
 * import { unregisterExtension } from '@gears-frontx/framework';
 * unregisterExtension('gts.frontx.mfes.ext.extension.v1~my.extension.v1');
 * ```
 */
export function unregisterExtension(extensionId: string): void {
  eventBus.emit(MfeEvents.UnregisterExtensionRequested, { extensionId });
}
