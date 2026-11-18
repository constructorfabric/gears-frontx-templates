/**
 * The package observes no mounted or routed state: the shell owns its screen
 * domain implementation, so it already knows which extension that
 * implementation mounted, and no route state is exposed to shell code.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Extension } from '@gears-frontx/framework';
import { authRealm, authRealmShared } from '../src/index';
import type { useDomainExtensions } from '../src/mfe/hooks/useDomainExtensions';

describe('@gears-frontx/react public exports', () => {
  it('useDomainExtensions returns extensions without their route', () => {
    expectTypeOf<ReturnType<typeof useDomainExtensions>>().toEqualTypeOf<Array<Omit<Extension, 'route'>>>();
  });

  it('re-exports authRealm and authRealmShared from the framework', () => {
    expect(authRealm).toBeTypeOf('function');
    expect(authRealmShared).toBeTypeOf('function');
  });
});
