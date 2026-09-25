/**
 * Tests for the `entry_addresses` shared-property schema (T6a).
 *
 * `updateSharedProperty` (mfes' `DefaultExtensionManager`) validates a shared
 * property's runtime value by calling `TypeSystemPlugin.register({ id, value })`
 * with an ephemeral instance id (`propertyId + 'frontx.mfes.comm.runtime.v1'`),
 * not `validateInstance(instance)` on an ad-hoc object — `validateInstance`
 * only takes an already-registered instance id. These tests exercise the
 * schema the same way the real caller does, registering then throwing on an
 * invalid value (`GtsPlugin.register` throws synchronously; there is no
 * separate `.valid` result to inspect for a `register` call).
 */

import { describe, expect, it } from 'vitest';
import { gtsPlugin } from '@gears-frontx/gts-plugin';
import { entryAddressesSchema, FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '../src';

describe('entry-addresses shared property schema', () => {
  gtsPlugin.registerSchema(entryAddressesSchema);
  const instanceId = `${FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES}frontx.mfes.comm.runtime.v1`;

  it('accepts a map of extension ids to entry addresses', () => {
    const value = {
      'ext.a': { domainKey: 'screen', extension: 'hello-world' },
      'ext.b': { domainKey: 'screen.widgets-host.widgets', extension: 'widget-alpha' },
    };

    expect(() => gtsPlugin.register({ id: instanceId, value })).not.toThrow();
    expect(gtsPlugin.validateInstance(instanceId).valid).toBe(true);
  });

  it.each([
    ['an uppercase domain key', { 'ext.a': { domainKey: 'Screen', extension: 'x' } }],
    ['a missing extension field', { 'ext.a': { domainKey: 'screen' } }],
    ['a non-object value', 'nope'],
  ])('rejects %s', (_label, value) => {
    expect(() => gtsPlugin.register({ id: instanceId, value })).toThrow();
  });
});
