import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LoadGuards } from './LoadGuards.mjs';
import { HTTP1_BOOT_BASELINE } from './MatrixProfiles.mjs';

describe('LoadGuards — the two guards and noise-margin sessions', () => {
  const g = new LoadGuards({ noiseMargin: 0.15, bootGuardRatio: 1.25, sessionGuardRatio: 1.15 });

  it('judgeBoot: ≤ old-rule median × 1.25 (HTTP/2 + gzip, Fast 4G + 4x CPU, cold)', () => {
    const r = g.judgeBoot({ newMs: 2000, oldMs: 2000, profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.pass).toBe(true);
    expect(r.allowed).toBe(2500);
    expect(r.ratio).toBeCloseTo(1.0);
  });

  it('judgeBoot fails when boot is more than 25% slower than the old rule', () => {
    const r = g.judgeBoot({ newMs: 2600, oldMs: 2000, profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.pass).toBe(false);
    expect(r.finding).toMatch(/shell boot/);
    expect(r.finding).toMatch(/1\.25/);
  });

  it('judgeStartupExtensions: ≤ old-rule median × 1.25 (shell + startup extensions guard)', () => {
    const r = g.judgeStartupExtensions({ newMs: 2400, oldMs: 2000, profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.pass).toBe(true);
    expect(r.allowed).toBe(2500);
  });

  it('judgeStartupExtensions fails beyond 1.25×', () => {
    const r = g.judgeStartupExtensions({ newMs: 3000, oldMs: 2000, profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.pass).toBe(false);
    expect(r.finding).toMatch(/shell \+ startup extensions/);
  });

  it('judgeSession (shell+1, shell+5): ≤ old-rule median × 1.15 (noise margin)', () => {
    const r = g.judgeSession({ newMs: 2200, oldMs: 2000, sessionKind: 'shell+1', profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.pass).toBe(true);
    expect(r.allowed).toBe(2300);
  });

  it('judgeSession fails beyond 1.15×', () => {
    const r = g.judgeSession({ newMs: 2400, oldMs: 2000, sessionKind: 'shell+5-sequential', profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.pass).toBe(false);
    expect(r.finding).toMatch(/shell\+5-sequential/);
    expect(r.finding).toMatch(/1\.15/);
  });

  it('judgeHttp1Boot: within the noise margin of the stored baseline passes, for office-LAN and Fast 4G', () => {
    const lan = g.judgeHttp1Boot({ profile: 'office-lan', newMs: 170, baselineMs: 181 });
    expect(lan.pass).toBe(true); // 170 ≤ ceil(181 × 1.15) = 209
    expect(lan.allowed).toBe(209);
    expect(lan.kind).toBe('http1-boot-reported');
    const slow = g.judgeHttp1Boot({ profile: 'fast-4g', newMs: 9187, baselineMs: 9187 });
    expect(slow.pass).toBe(true);
  });

  it('judgeHttp1Boot fails when HTTP/1.1 boot regresses from the stored baseline beyond the noise margin', () => {
    const r = g.judgeHttp1Boot({ profile: 'fast-4g', newMs: 10600, baselineMs: 9187 });
    expect(r.pass).toBe(false); // 10600 > ceil(9187 × 1.15) = 10566
    expect(r.finding).toMatch(/HTTP\/1\.1 fast-4g/);
    expect(r.finding).toMatch(/regressed from the baseline/);
    expect(r.finding).toMatch(/not gated against the old rule/);
  });

  it('reads the HTTP/1.1 boot baseline from its data file', () => {
    const data = JSON.parse(readFileSync(new URL('./http1-boot-baseline.json', import.meta.url), 'utf8'));
    expect(HTTP1_BOOT_BASELINE).toEqual(data.bootMs);
    for (const ms of Object.values(HTTP1_BOOT_BASELINE)) {
      expect(typeof ms).toBe('number');
      expect(ms).toBeGreaterThan(0);
    }
  });

  it('records the gate cell context (protocol, profile, compression, cache state) in every finding', () => {
    const r = g.judgeBoot({ newMs: 3000, oldMs: 2000, profile: 'fast-4g', protocol: 'h2', compression: 'gzip' });
    expect(r.cell).toEqual({ protocol: 'h2', profile: 'fast-4g', compression: 'gzip', cacheState: 'cold' });
  });
});
