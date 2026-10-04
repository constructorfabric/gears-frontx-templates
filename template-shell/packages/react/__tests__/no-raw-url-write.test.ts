/**
 * Phase 8, AC8.3 (`cpt-frontx-adr-extension-routing-port`, "URL ownership";
 * `cpt-frontx-routing-fr-route-ownership-signal` FEATURE's Binding
 * obligation): shell, MFE, and host code never write the URL — every
 * occupancy change is a byproduct of an executed `mount_ext`/`unmount_ext`,
 * and no interface FrontX hands to extension or host code exposes an
 * occupant's address or raw history. This file is the direct test the
 * acceptance criterion names:
 *
 *  1. Enumerate every export of `@gears-frontx/framework` and
 *     `@gears-frontx/react` and confirm none of them IS, or exposes as an
 *     own enumerable member, the raw `window.history` object or a
 *     `pushState`/`replaceState` method lifted from it.
 *  2. Confirm neither package exports the `FrameworkRouter` class, and that
 *     the app-facing handle `app.mfeRouter` publishes (ADR 0036) carries
 *     none of `RouterPort`'s members, `attachRegistry`, or anything else
 *     that would yield the router instance or an occupant value — only the
 *     navigation facade (D5/D10: building/rendering an extension's own
 *     router, and a routed domain's own start/stop/status, are reached
 *     through framework-internal paths instead — `<ExtensionRouter>` and
 *     `ExtensionDomainSlot`, never through `app.mfeRouter`).
 *  3. Confirm the navigation facade (`app.mfeRouter.navigation()` — ADR
 *     0036, "The navigation facade") exposes exactly `{navigate, replace}`
 *     and nothing else: no router, no occupant value, no raw history object
 *     a caller could read `.go()`/`.location` off of.
 *
 * The navigation facade's own write-confinement behaviour (one occupant's
 * write leaves a sibling occupant's entry untouched) is `FrameworkRouter`'s
 * own obligation, white-box tested against the class directly in
 * `packages/framework/src/plugins/microfrontends/__tests__/router.test.ts`
 * — this file only tests what the PUBLIC surface exposes.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as framework from '@gears-frontx/framework';
import * as reactPkg from '@gears-frontx/react';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

/** A runtime builds one app, so every test that builds one loads its own copy of the framework. */
async function buildMfeApp() {
  vi.resetModules();
  const fresh = await import('@gears-frontx/framework');
  return fresh.createFrontX().use(fresh.microfrontends({ typeSystem: fresh.gtsPlugin })).build();
}

/** Own-key, enumerable members of `value`, one level deep — enough to catch a flattened re-export of `window.history` itself or a bound `pushState`/`replaceState`. */
function ownMemberNames(value: unknown): string[] {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return [];
  try {
    return Object.keys(value as object);
  } catch {
    return [];
  }
}

/** Every own-named member reachable off `value`, walking its prototype chain (stopping before `Object.prototype`) — unlike `ownMemberNames`, this also surfaces class methods (which live on the prototype, not the instance), so it can confirm a published handle carries ONLY the members it is supposed to. */
function allReachableMemberNames(value: unknown): string[] {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return [];
  const names = new Set<string>();
  let target: object | null = value as object;
  while (target && target !== Object.prototype && target !== Function.prototype) {
    for (const name of Object.getOwnPropertyNames(target)) {
      if (name === 'constructor') continue;
      names.add(name);
    }
    target = Object.getPrototypeOf(target);
  }
  return [...names];
}

describe('AC8.3 — no exported surface writes the raw URL', () => {
  it('no export of @gears-frontx/framework or @gears-frontx/react IS, or exposes, the raw history object or its push/replace methods', () => {
    for (const [moduleName, mod] of [
      ['@gears-frontx/framework', framework],
      ['@gears-frontx/react', reactPkg],
    ] as const) {
      for (const [name, value] of Object.entries(mod)) {
        expect(value, `${moduleName}#${name} must not BE window.history`).not.toBe(window.history);
        const members = ownMemberNames(value);
        expect(members, `${moduleName}#${name} must not expose pushState`).not.toContain('pushState');
        expect(members, `${moduleName}#${name} must not expose replaceState`).not.toContain('replaceState');
      }
    }
  });

  it('calling every zero-arg exported function with no setup never writes to window.history directly', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    for (const mod of [framework, reactPkg]) {
      for (const value of Object.values(mod)) {
        if (typeof value !== 'function') continue;
        // Skip classes (constructable with `new`) and anything declaring
        // parameters — this check is for the plain factory/helper functions
        // this package exports (e.g. `effects()`, `createFrontX()`), not for
        // React components (which need a render tree, not a bare call) or
        // classes (which need `new` and usually constructor arguments).
        const src = Function.prototype.toString.call(value);
        if (/^class[\s{]/.test(src)) continue;
        if (value.length > 0) continue;
        try {
          (value as () => unknown)();
        } catch {
          // A bare call failing its own precondition is fine — the
          // assertion is about what it does before/if it throws, not
          // whether it succeeds standalone.
        }
      }
    }

    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('neither @gears-frontx/framework nor @gears-frontx/react exports the FrameworkRouter class', () => {
    expect((framework as Record<string, unknown>).FrameworkRouter).toBeUndefined();
    expect((reactPkg as Record<string, unknown>).FrameworkRouter).toBeUndefined();
  });

  it('app.mfeRouter exposes only the navigation facade — no RouterPort member, attachRegistry, domain-lifecycle/status call, or anything else that would yield the router instance or an occupant value', async () => {
    const app = await buildMfeApp();
    try {
      const router = app.mfeRouter;
      expect(router).toBeDefined();
      const members = allReachableMemberNames(router).sort();
      expect(members).toEqual(['navigation']);
      // RouterPort's own members, the template-only `attachRegistry` wiring
      // call, and the domain-lifecycle/status calls — all reached only
      // through framework-internal paths (`<ExtensionRouter>`,
      // `ExtensionDomainSlot`), never through an app object.
      for (const forbidden of [
        'attachRegistry',
        'registerDomain',
        'registerExtension',
        'releaseDomain',
        'releaseExtension',
        'assignOccupantValue',
        'reportSettled',
        'supplyNavigation',
        'adaptHistory',
        'startDomain',
        'stopDomain',
        'domainStatus',
        'subscribeDomainStatus',
      ]) {
        expect(members, `app.mfeRouter must not expose ${forbidden}`).not.toContain(forbidden);
      }
    } finally {
      app.destroy();
    }
  });

  it('app.mfeRouter.navigation() exposes exactly {location, navigate, replace} — no router, occupant value, or raw history', async () => {
    const app = await buildMfeApp();
    try {
      const facade = app.mfeRouter!.navigation();
      expect(Object.keys(facade).sort()).toEqual(['location', 'navigate', 'replace']);
      expect(typeof facade.location).toBe('function');
      expect(typeof facade.navigate).toBe('function');
      expect(typeof facade.replace).toBe('function');
      // D21: a read returns only {pathname, search} — no router, occupant
      // value, or raw history object reachable off it.
      const here = facade.location();
      expect(Object.keys(here).sort()).toEqual(['pathname', 'search']);
      expect(typeof here.pathname).toBe('string');
      expect(typeof here.search).toBe('string');
    } finally {
      app.destroy();
    }
  });

  it('no internal routing function is exported from @gears-frontx/framework or @gears-frontx/react public entries — only `@gears-frontx/framework/internal` carries them', () => {
    for (const [moduleName, mod] of [
      ['@gears-frontx/framework', framework],
      ['@gears-frontx/react', reactPkg],
    ] as const) {
      for (const forbidden of [
        'buildExtensionHistory',
        'startRoutedDomain',
        'stopRoutedDomain',
        'teardownRoutedDomain',
        'routedDomainStatus',
        'subscribeRoutedDomainStatus',
      ]) {
        expect(
          Object.prototype.hasOwnProperty.call(mod, forbidden),
          `${moduleName} must not export ${forbidden}`,
        ).toBe(false);
      }
    }
  });
});
