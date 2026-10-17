/**
 * The package observes no mounted or routed state: the shell owns its screen
 * domain implementation, so it already knows which extension that
 * implementation mounted, and no route state is exposed to shell code. The
 * package carries no routing code either: an MFE with routes renders the
 * extension router of `@gears-frontx/routing-tanstack`, not one from here.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Extension } from '@gears-frontx/framework';
import * as react from '../src/index';
import * as mfe from '../src/mfe/index';
import type { useDomainExtensions } from '../src/mfe/hooks/useDomainExtensions';
import * as hooks from '../src/mfe/hooks/index';

const modules = [
  ['package index', react],
  ['mfe index', mfe],
  ['mfe hooks index', hooks],
] as const;

describe('@gears-frontx/react public exports', () => {
  describe.each(['useMountedExtensions', 'useDomainRouteStatus'])('%s', (name) => {
    it.each(modules)('the %s does not export it', (_label, mod) => {
      expect(name in mod).toBe(false);
    });
  });

  describe.each(['ExtensionRouter'])('%s', (name) => {
    it.each(modules)('the %s does not export it', (_label, mod) => {
      expect(name in mod).toBe(false);
    });
  });

  it('useDomainExtensions returns extensions without their route', () => {
    expectTypeOf<ReturnType<typeof useDomainExtensions>>().toEqualTypeOf<Array<Omit<Extension, 'route'>>>();
  });
});
