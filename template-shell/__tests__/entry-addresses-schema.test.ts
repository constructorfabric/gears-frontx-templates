/**
 * Tests for the `entry_addresses` shared-property schema (constructorfabric/gears-frontx#638).
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

import { beforeAll, describe, expect, it } from 'vitest';
import { gtsPlugin } from '@gears-frontx/gts-plugin';
import { validateName } from '@gears-frontx/routing';
import { entryAddressesSchema, FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '../src';

describe('entry-addresses shared property schema', () => {
  const instanceId = `${FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES}frontx.mfes.comm.runtime.v1`;

  beforeAll(() => {
    gtsPlugin.registerSchema(entryAddressesSchema);
  });

  it('accepts a map of extension ids to entry addresses', () => {
    const value = {
      'hello-world': { domainKey: 'screen', extension: 'hello-world' },
      'widget-alpha': { domainKey: 'screen.widgets-host.widgets', extension: 'widget-alpha' },
    };

    expect(() => gtsPlugin.register({ id: instanceId, value })).not.toThrow();
  });

  it.each([
    ['an uppercase domain key', { 'hello-world': { domainKey: 'Screen', extension: 'hello-world' } }],
    ['a missing extension field', { 'hello-world': { domainKey: 'screen' } }],
    ['a non-object value', 'nope'],
    [
      'an even segment count domain key',
      { 'widget-alpha': { domainKey: 'screen.widgets-host', extension: 'widget-alpha' } },
    ],
    [
      'an empty segment in the domain key',
      { 'widget-alpha': { domainKey: 'screen..widgets-host', extension: 'widget-alpha' } },
    ],
    [
      'an extra property on the address',
      { 'hello-world': { domainKey: 'screen', extension: 'hello-world', extra: 'nope' } },
    ],
    ['an extension token with a leading slash', { 'hello-world': { domainKey: 'screen', extension: '/hello-world' } }],
    ['an uppercase extension token', { 'hello-world': { domainKey: 'screen', extension: 'Hello' } }],
    ['an empty extension-id key', { '': { domainKey: 'screen', extension: 'hello-world' } }],
  ])('rejects %s', (_label, value) => {
    expect(() => gtsPlugin.register({ id: instanceId, value })).toThrow(/GTS validation failed/);
  });

  it('agrees with the routing grammar on which domain-key segments are valid names', () => {
    // The schema's per-segment pattern (`^[a-z][a-z0-9-]*$`) is the same
    // alphabet `@gears-frontx/routing`'s `validateName` enforces for a
    // `name` token (ADR 0003, "Tokens"); this pins the two in lockstep so a
    // grammar change there can't silently drift from what this schema accepts.
    for (const segment of ['screen', 'widgets-host', 'widgets']) {
      expect(validateName(segment)).toBe(true);
    }
    for (const segment of ['Screen', '']) {
      expect(validateName(segment)).toBe(false);
    }
  });
});
