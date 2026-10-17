/**
 * The framework exposes no mounted or routed state: the shell owns its screen
 * domain implementation and knows which extension it mounted, and no route
 * state is exposed to shell code. The framework carries no routing code of its
 * own either: it passes the FrontX router to the registry it builds and exports
 * nothing that routes.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Extension, ExtensionDomain, MfeRegistry } from '@gears-frontx/mfes';
import * as pkg from '../src/index';
import * as plugins from '../src/plugins/index';
import * as microfrontends from '../src/plugins/microfrontends/index';

const modules = [
  ['package index', pkg],
  ['plugins index', plugins],
  ['microfrontends plugin index', microfrontends],
] as const;

describe('@gears-frontx/framework public exports', () => {
  describe.each(['subscribeSettledMounts', 'routedDomainStatus', 'subscribeRoutedDomainStatus'])('%s', (name) => {
    it.each(modules)('the %s does not export it', (_label, mod) => {
      expect(name in mod).toBe(false);
    });
  });

  describe.each(['FrameworkRouter', 'buildExtensionHistory', 'startRoutedDomain', 'stopRoutedDomain'])('%s', (name) => {
    it.each(modules)('the %s does not export it', (_label, mod) => {
      expect(name in mod).toBe(false);
    });
  });

  it('the MfeRegistry type reveals no mounted state and no other domain occupancy', () => {
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getMountedExtensions');
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getParentBridge');
  });

  it('the MfeRegistry registration reads return no route', () => {
    expectTypeOf<ReturnType<MfeRegistry['getExtension']>>().toEqualTypeOf<Omit<Extension, 'route'> | undefined>();
    expectTypeOf<ReturnType<MfeRegistry['getExtensionsForDomain']>>().toEqualTypeOf<Array<Omit<Extension, 'route'>>>();
    expectTypeOf<ReturnType<MfeRegistry['getExtensionsForPackage']>>().toEqualTypeOf<Array<Omit<Extension, 'route'>>>();
    expectTypeOf<ReturnType<MfeRegistry['getDomain']>>().toEqualTypeOf<Omit<ExtensionDomain, 'route'> | undefined>();
  });
});
