/**
 * The framework exposes no mounted or routed state: the shell owns its screen
 * domain implementation and knows which extension it mounted, and no route
 * state is exposed to shell code.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Extension, ExtensionDomain, MfeRegistry } from '@gears-frontx/mfes';

describe('@gears-frontx/framework public exports', () => {
  it('the MfeRegistry type reveals no mounted state and no other domain occupancy', () => {
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getMountedExtensions');
    expectTypeOf<MfeRegistry>().not.toHaveProperty('getParentBridge');
  });

  it('the MfeRegistry registration reads return no route', () => {
    expectTypeOf<ReturnType<MfeRegistry['getExtension']>>().toEqualTypeOf<Omit<Extension, 'route'> | undefined>();
    expectTypeOf<ReturnType<MfeRegistry['getExtensionsForDomain']>>().toEqualTypeOf<Array<Omit<Extension, 'route'>>>();
    expectTypeOf<ReturnType<MfeRegistry['getDomain']>>().toEqualTypeOf<Omit<ExtensionDomain, 'route'> | undefined>();
  });
});
