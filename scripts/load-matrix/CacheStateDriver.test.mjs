import { describe, expect, it } from 'vitest';
import { CacheStateDriver } from './CacheStateDriver.mjs';

describe('CacheStateDriver — cache states (warm_session)', () => {
  it('plans cold: empty cache, first visit', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const plan = d.plan('cold');
    expect(plan.state).toBe('cold');
    expect(plan.clearCache).toBe(true);
    expect(plan.rebuild).toBe(false);
    expect(plan.description).toMatch(/empty cache, first visit/);
  });

  it('plans warm: repeat visit, same build', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const plan = d.plan('warm');
    expect(plan.state).toBe('warm');
    expect(plan.clearCache).toBe(false);
    expect(plan.rebuild).toBe(false);
    expect(plan.description).toMatch(/repeat visit, same build/);
  });

  it('plans upgrade: repeat visit after a release upgrading one shared package and changing one MFE', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const plan = d.plan('upgrade');
    expect(plan.state).toBe('upgrade');
    expect(plan.clearCache).toBe(false);
    expect(plan.rebuild).toBe(true);
    expect(plan.upgrade).toEqual({
      packageName: '@gears-frontx/shared-x',
      mfe: '_blank-mfe',
      change: 'bump version + change one exported function body',
    });
    expect(plan.description).toMatch(/repeat visit after a release upgrading one shared package and changing one MFE/);
  });

  it('applyUpgrade returns the upgrade fixture changes (per-package caching benefit)', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const changes = d.applyUpgrade();
    expect(changes.upgradedPackage).toBe('@gears-frontx/shared-x');
    expect(changes.mfeSourceChange).toBe('_blank-mfe');
    expect(changes.kind).toBe('version-bump-and-function-body-change');
  });

  it('throws on an unknown cache state', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: 'p', mfe: 'm' },
    });
    expect(() => d.plan('hot')).toThrow(/unknown cache state/);
  });

  it('records the upgrade fixture package name (recorded in the out file)', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/ui-kit', mfe: '_blank-mfe' },
    });
    expect(d.upgradeFixturePackageName()).toBe('@gears-frontx/ui-kit');
  });

  it('gates stay on cold: isGateState(cold) is true, others false', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: 'p', mfe: 'm' },
    });
    expect(d.isGateState('cold')).toBe(true);
    expect(d.isGateState('warm')).toBe(false);
    expect(d.isGateState('upgrade')).toBe(false);
  });

  it('perRunPolicy(cold): clear the browser cache before every run (first visit, no rebuild)', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const p = d.perRunPolicy('cold');
    expect(p.clearBrowserCacheBeforeRun).toBe(true);
    expect(p.keepHttpCacheAcrossRuns).toBe(false);
    expect(p.rebuildBeforeRuns).toBe(false);
    expect(p.warmCacheFromFirstBuild).toBe(false);
    expect(p.revertRebuildAfterRuns).toBe(false);
    expect(p.recordReDownloadedBytes).toBe(false);
  });

  it('perRunPolicy(warm): keep the HTTP cache across runs (repeat visit, same build, no rebuild)', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const p = d.perRunPolicy('warm');
    expect(p.clearBrowserCacheBeforeRun).toBe(false);
    expect(p.keepHttpCacheAcrossRuns).toBe(true);
    expect(p.rebuildBeforeRuns).toBe(false);
    expect(p.warmCacheFromFirstBuild).toBe(false);
    expect(p.revertRebuildAfterRuns).toBe(false);
    expect(p.recordReDownloadedBytes).toBe(false);
  });

  it('perRunPolicy(upgrade): warm cache from first build, rebuild once with content-only change, revert after, report re-downloaded bytes', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: '@gears-frontx/shared-x', mfe: '_blank-mfe' },
    });
    const p = d.perRunPolicy('upgrade');
    expect(p.clearBrowserCacheBeforeRun).toBe(false);
    expect(p.keepHttpCacheAcrossRuns).toBe(true);
    expect(p.rebuildBeforeRuns).toBe(true);
    expect(p.warmCacheFromFirstBuild).toBe(true);
    expect(p.revertRebuildAfterRuns).toBe(true);
    expect(p.recordReDownloadedBytes).toBe(true);
  });

  it('perRunPolicy throws on an unknown cache state (fail closed)', () => {
    const d = new CacheStateDriver({
      upgradeFixture: { packageName: 'p', mfe: 'm' },
    });
    expect(() => d.perRunPolicy('hot')).toThrow(/unknown cache state/);
  });
});
