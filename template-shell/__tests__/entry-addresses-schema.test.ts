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
 *
 * The map is keyed by extension id (the bridge's `extensionId`, a full GTS
 * id such as `gts.frontx.mfes.ext.extension.v1~...`), not by the `extension`
 * token carried in the address value — those two are deliberately different
 * strings, so the fixtures below use real extension ids from the templates'
 * own manifests (`template-mfe/src-app/mfe_packages/{demo-mfe,widgets-fixture-a}/mfe.json`)
 * as keys, and keep `extension` as the short token.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { gtsPlugin } from '@gears-frontx/gts-plugin';
import { validateName } from '@gears-frontx/routing';
import { entryAddressesSchema, FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '../src';

// Real extension ids drawn from the templates' own mfe.json manifests, so a
// key containing both `~` and `_` is exercised by fixtures, not invented.
const HELLO_WORLD_EXTENSION_ID =
  'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.demo.screens.helloworld.v1';
const WIDGET_ALPHA_EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.widgets.fixture_a.widget_alpha.v1';

describe('entry-addresses shared property schema', () => {
  const instanceId = `${FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES}frontx.mfes.comm.runtime.v1`;

  beforeAll(() => {
    gtsPlugin.registerSchema(entryAddressesSchema);
  });

  it('accepts a map of extension ids to entry addresses', () => {
    const value = {
      [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: 'hello-world' },
      [WIDGET_ALPHA_EXTENSION_ID]: { domainKey: 'screen.widgets-host.widgets', extension: 'widget-alpha' },
    };

    expect(() => gtsPlugin.register({ id: instanceId, value })).not.toThrow();
  });

  it.each([
    ['an uppercase domain key', { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'Screen', extension: 'hello-world' } }],
    ['a missing extension field', { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen' } }],
    ['a non-object value', 'nope'],
    [
      'an even segment count domain key',
      { [WIDGET_ALPHA_EXTENSION_ID]: { domainKey: 'screen.widgets-host', extension: 'widget-alpha' } },
    ],
    [
      'an empty segment in the domain key',
      { [WIDGET_ALPHA_EXTENSION_ID]: { domainKey: 'screen..widgets-host', extension: 'widget-alpha' } },
    ],
    [
      'a domain key segment starting with a digit',
      { [HELLO_WORLD_EXTENSION_ID]: { domainKey: '1screen', extension: 'hello-world' } },
    ],
    [
      'a domain key segment starting with a hyphen',
      { [HELLO_WORLD_EXTENSION_ID]: { domainKey: '-screen', extension: 'hello-world' } },
    ],
    [
      'an extra property on the address',
      { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: 'hello-world', extra: 'nope' } },
    ],
    [
      'an extension token with a leading slash',
      { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: '/hello-world' } },
    ],
    ['an uppercase extension token', { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: 'Hello' } }],
    [
      'an extension token starting with a digit',
      { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: '1hello' } },
    ],
    [
      'an extension token starting with a hyphen',
      { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: '-hello' } },
    ],
    ['an empty extension-id key', { '': { domainKey: 'screen', extension: 'hello-world' } }],
  ])('rejects %s', (_label, value) => {
    expect(() => gtsPlugin.register({ id: instanceId, value })).toThrow(/GTS validation failed/);
  });

  // Both `domainKey`'s per-segment pattern and `extension`'s pattern are
  // `^[a-z][a-z0-9-]*$` — the same alphabet `validateName` enforces for a
  // `name` token (ADR 0003, "Tokens"). Rather than asserting that against
  // two independently-picked literal lists (which proves nothing about
  // drift), this runs each literal through both `validateName` and the
  // schema, once as `domainKey` and once as `extension`, so a grammar change
  // on either field's own pattern fails this test.
  //
  // Each check pairs the literal under test with a known-valid value in the
  // *other* field, rather than setting both fields to the same literal: a
  // shared-literal pairing would let a regex drift on one field hide behind
  // the other field still rejecting the same string (e.g. loosening only
  // `extension`'s pattern would go unnoticed for an invalid literal that
  // `domainKey` still rejects on its own).
  const NAME_LITERALS: ReadonlyArray<readonly [string, boolean]> = [
    ['screen', true],
    ['widgets-host', true],
    ['widgets', true],
    ['Screen', false],
    ['', false],
    ['1screen', false],
    ['-screen', false],
  ];

  it.each(NAME_LITERALS)('schema and validateName agree on whether "%s" is a valid domainKey', (literal, expectedValid) => {
    expect(validateName(literal)).toBe(expectedValid);

    const value = { [HELLO_WORLD_EXTENSION_ID]: { domainKey: literal, extension: 'hello-world' } };
    const attempt = () => gtsPlugin.register({ id: instanceId, value });

    if (expectedValid) {
      expect(attempt).not.toThrow();
    } else {
      expect(attempt).toThrow(/GTS validation failed/);
    }
  });

  it.each(NAME_LITERALS)('schema and validateName agree on whether "%s" is a valid extension token', (literal, expectedValid) => {
    expect(validateName(literal)).toBe(expectedValid);

    const value = { [HELLO_WORLD_EXTENSION_ID]: { domainKey: 'screen', extension: literal } };
    const attempt = () => gtsPlugin.register({ id: instanceId, value });

    if (expectedValid) {
      expect(attempt).not.toThrow();
    } else {
      expect(attempt).toThrow(/GTS validation failed/);
    }
  });
});
