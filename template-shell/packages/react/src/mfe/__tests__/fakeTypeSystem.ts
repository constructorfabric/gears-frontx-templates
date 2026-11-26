/**
 * A test-local `TypeSystemPlugin`.
 *
 * The React bindings are type-system agnostic, so their own tests run the MFE host
 * plugin against this stand-in instead of a concrete type system: every
 * entity registers and validates, `getSchema` answers whatever was registered
 * under that ID, a type is of a base type when its ID starts with the base ID,
 * and the lifecycle actions and stages resolve to the opaque IDs below.
 */
import type { TypeSystemPlugin } from '@gears-frontx/framework/mfe';

export const FAKE_LOAD_EXT = 'test.action.load_ext';
export const FAKE_MOUNT_EXT = 'test.action.mount_ext';
export const FAKE_UNMOUNT_EXT = 'test.action.unmount_ext';

export function createFakeTypeSystem(): TypeSystemPlugin {
  const store = new Map<string, unknown>();
  const keep = (entity: unknown): void => {
    const id = (entity as { id?: unknown; $id?: unknown } | null)?.id ?? (entity as { $id?: unknown } | null)?.$id;
    if (typeof id === 'string') store.set(id, entity);
  };
  return {
    name: 'fake',
    version: '0.0.0',
    registerSchema: keep,
    getSchema: (typeId) => store.get(typeId),
    register: keep,
    validateInstance: () => ({ valid: true, errors: [] }),
    isTypeOf: (typeId, baseTypeId) => typeId.startsWith(baseTypeId),
    resolveLoadExtActionId: () => FAKE_LOAD_EXT,
    resolveMountExtActionId: () => FAKE_MOUNT_EXT,
    resolveUnmountExtActionId: () => FAKE_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => 'test.stage.init',
    resolveLifecycleStageActivatedId: () => 'test.stage.activated',
    resolveLifecycleStageDeactivatedId: () => 'test.stage.deactivated',
    resolveLifecycleStageDestroyedId: () => 'test.stage.destroyed',
  };
}
