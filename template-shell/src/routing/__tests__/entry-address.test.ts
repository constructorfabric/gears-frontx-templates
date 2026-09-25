import { describe, expect, it } from 'vitest';
import type { ChildMfeBridge, Extension, ExtensionDomain, MfeRegistry } from '@gears-frontx/mfes';
import type { DomainKey } from '@gears-frontx/routing';
import { FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES } from '../../gts';
import { buildEntryAddresses, readEntryAddress, rootDomainKeyOf } from '../entry-address';

const bridge = (value: unknown, extensionId = 'ext.a') =>
  ({
    extensionId,
    getProperty: (id: string) => (id === FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES ? { id, value } : undefined),
  }) as unknown as ChildMfeBridge;

describe('readEntryAddress', () => {
  it('reads this extension own address from the property', () => {
    expect(readEntryAddress(bridge({ 'ext.a': { domainKey: 'screen', extension: 'hello-world' } }))).toEqual({
      domainKey: 'screen',
      extension: 'hello-world',
    });
  });
  it.each([undefined, {}, { 'ext.b': { domainKey: 'screen', extension: 'x' } }, { 'ext.a': { domainKey: 'screen' } }, 'x'])(
    'returns undefined for %j',
    (value) => {
      expect(readEntryAddress(bridge(value))).toBeUndefined();
    },
  );
  it('returns undefined without a bridge', () => expect(readEntryAddress(undefined)).toBeUndefined());
});

describe('buildEntryAddresses', () => {
  it('maps every routable extension of each projected domain to its address', () => {
    const exts: Record<string, Extension[]> = {
      screen: [
        { id: 'ext.hello', domain: 'screen', entry: 'e', presentation: { route: '/hello-world' } } as unknown as Extension,
        { id: 'ext.nr', domain: 'screen', entry: 'e' } as Extension,
      ],
      sidebar: [],
    };
    const registry = { getExtensionsForDomain: (d: string) => exts[d] ?? [] } as unknown as MfeRegistry;
    expect(
      buildEntryAddresses(registry, [
        { domainId: 'screen', domainKey: 'screen' as DomainKey },
        { domainId: 'sidebar', domainKey: 'sidebar' as DomainKey },
      ]),
    ).toEqual({ 'ext.hello': { domainKey: 'screen', extension: 'hello-world' } });
  });
});

describe('rootDomainKeyOf', () => {
  it('uses the declared route when it is a valid name', () => {
    expect(rootDomainKeyOf({ id: 'd', route: 'screen' } as ExtensionDomain)).toBe('screen');
    expect(rootDomainKeyOf({ id: 'd' } as ExtensionDomain)).toBeUndefined();
    expect(rootDomainKeyOf({ id: 'd', route: 'Screen' } as ExtensionDomain)).toBeUndefined();
  });
});
