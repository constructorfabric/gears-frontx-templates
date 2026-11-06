// @vitest-environment node
// The per-screen waiver file both runners honour: what it may hold, which
// findings an entry covers, and what the report says about unused and
// expired entries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyWaivers,
  coversRendered,
  coversSource,
  loadWaivers,
  parseWaivers,
  waiverLines,
  waiverReport,
  WaiverError,
} from '../runner/waivers.mjs';
import { readSkillJson } from '../runner/skill.mjs';

const registry = readSkillJson('rules/quality-gates.json');
const context = { file: 'design-waivers.json', today: '2026-11-06' };
const entry = (over: object = {}) => ({
  gate: 'SYS-001',
  screen: { source: 'src/orders/**' },
  reason: 'The kit has no tree view yet (kit gap recorded in the handoff).',
  ...over,
});
const parse = (waivers: unknown[]) => parseWaivers({ waivers }, registry, context);

describe('parseWaivers', () => {
  it('accepts with-reason gates with a screen and a reason', () => {
    const [w] = parse([entry({ until: '2026-12-31' })]);
    expect(w).toMatchObject({ index: 0, gate: 'SYS-001', until: '2026-12-31', expired: false, used: 0 });
  });

  it('rejects never and finish gates, unknown gates and keys, and empty reasons', () => {
    expect(() => parse([entry({ gate: 'SYS-002' })])).toThrow(/SYS-002 has waiver "never" and cannot be waived/);
    expect(() => parse([entry({ gate: 'LAY-004' })])).toThrow(/LAY-004 has waiver "finish"/);
    expect(() => parse([entry({ gate: 'SYS-999' })])).toThrow(/"SYS-999" is not in rules\/quality-gates\.json/);
    expect(() => parse([entry({ gate: 'unmapped' })])).toThrow(/not in rules/);
    expect(() => parse([entry({ reason: '  ' })])).toThrow(/waivers\[0\]: needs a non-empty "reason"/);
    expect(() => parse([entry({ reason: undefined })])).toThrow(/non-empty "reason"/);
    expect(() => parse([entry({ gates: 'SYS-001' })])).toThrow(/unknown key "gates"/);
    expect(() => parseWaivers([], registry, context)).toThrow(/"waivers" array/);
    expect(() => parseWaivers({ waivers: [], extra: 1 }, registry, context)).toThrow(/unknown key "extra"/);
  });

  it('needs a screen with route, menu or source, and a real date in until', () => {
    expect(() => parse([entry({ screen: undefined })])).toThrow(/needs a "screen" object/);
    expect(() => parse([entry({ screen: {} })])).toThrow(/screen needs "route", "menu" or "source"/);
    expect(() => parse([entry({ screen: { path: 'x' } })])).toThrow(/screen: unknown key "path"/);
    expect(() => parse([entry({ screen: { route: '' } })])).toThrow(/screen\.route must be a non-empty string/);
    expect(() => parse([entry({ until: 'next week' })])).toThrow(/YYYY-MM-DD/);
  });

  it.each(['2026-13-01', '2026-02-30', '2026-00-10', '2026-04-31'])(
    'rejects the out-of-range until %s as a waiver error naming the entry',
    (until) => {
      const run = () => parse([entry(), entry({ until })]);
      expect(run).toThrow(WaiverError);
      expect(run).toThrow(`design-waivers.json: waivers[1]: "until" must be a date as YYYY-MM-DD, got "${until}"`);
    },
  );

  it('keeps the last day of until in force and expires the day after', () => {
    expect(parse([entry({ until: '2026-11-06' })])[0].expired).toBe(false);
    expect(parse([entry({ until: '2026-11-05' })])[0].expired).toBe(true);
  });
});

describe('loadWaivers', () => {
  it('uses the root file when present, nothing when absent, and fails on a named file that is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-waivers-'));
    try {
      expect(loadWaivers(undefined, root, registry)).toEqual({ waivers: [] });
      expect(() => loadWaivers(path.join(root, 'nope.json'), root, registry)).toThrow(/could not be read/);
      fs.writeFileSync(path.join(root, 'design-waivers.json'), JSON.stringify({ waivers: [entry()] }));
      const loaded = loadWaivers(undefined, root, registry, '2026-11-06');
      expect(loaded.file).toBe(path.join(root, 'design-waivers.json'));
      expect(loaded.waivers).toHaveLength(1);
      fs.writeFileSync(path.join(root, 'design-waivers.json'), '{ not json');
      expect(() => loadWaivers(undefined, root, registry)).toThrow(/could not be read/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('applyWaivers and the report section', () => {
  it('moves covered findings to waived with the reason, and reports unused, expired, not applicable and recorded entries', () => {
    const waivers = parse([
      entry(),
      entry({ screen: { source: 'src/billing/**' } }),
      entry({ until: '2026-01-01', screen: { source: 'src/orders/**' } }),
      entry({ screen: { route: '/?screen=orders' } }),
      entry({ gate: 'LAY-001', screen: { source: 'src/orders/**' } }),
      entry({ gate: 'STA-002', until: '2026-01-01', screen: { route: '/?screen=orders' } }),
      entry({ screen: { source: 'src/settings/**' } }),
      entry({ until: '2026-01-01', screen: { source: 'src/settings/**' } }),
    ]);
    const findings = [
      { gate: 'SYS-001', file: 'src/orders/Tree.tsx', found: '<table>' },
      { gate: 'SYS-002', file: 'src/orders/Tree.module.css', found: '#fff in color' },
      { gate: 'SYS-001', file: 'src/other/A.tsx', found: '<button>' },
    ];
    const split = applyWaivers(findings, waivers, coversSource);
    expect(split.findings.map((f) => f.found)).toEqual(['#fff in color', '<button>']);
    expect(split.waived).toEqual([
      { ...findings[0], waiver: { index: 0, reason: entry().reason } },
    ]);
    // The files the run read: src/billing has one, src/settings none.
    const read = [...findings.map((f) => f.file), 'src/billing/Invoice.tsx'];
    const runner = { mode: 'source' as const, gates: ['SYS-001', 'SYS-002'], exercised: read };
    const section = waiverReport({ file: 'design-waivers.json', waivers }, runner);
    expect(section?.applied).toBe(1);
    // Each entry lands in exactly one list; a gate this runner never reports is never unused,
    // and neither is a screen no file read matches.
    expect(section?.unused.map((w) => w.index)).toEqual([1]);
    expect(section?.expired.map((w) => w.index)).toEqual([2]);
    const unread = 'needs a file matching src/settings/** under --src; none of the files read matches';
    expect(section?.notApplicable.map((w) => [w.index, w.needs])).toEqual([
      [3, 'needs screen.source'],
      [6, unread],
      [7, unread],
    ]);
    expect(section?.recorded.map((w) => w.index)).toEqual([4, 5]);
    const lines = waiverLines(section).join('\n');
    expect(lines).toContain('UNUSED WAIVER #1 SYS-001 (source src/billing/**): matched no finding in this run');
    expect(lines).toContain('EXPIRED WAIVER #2 SYS-001 (source src/orders/**) until 2026-01-01');
    expect(lines).toContain('WAIVER #3 SYS-001 (route /?screen=orders): not applicable to this run (needs screen.source)\n');
    expect(lines).toContain(`WAIVER #6 SYS-001 (source src/settings/**): not applicable to this run (${unread})\n`);
    // A lapsed entry says so on whichever line it lands.
    expect(lines).toContain(
      `WAIVER #7 SYS-001 (source src/settings/**): not applicable to this run (${unread}), expired after 2026-01-01`,
    );
    expect(lines).not.toMatch(/UNUSED WAIVER #[67]/);
    expect(lines).toContain('RECORDED WAIVER #4 LAY-001 (source src/orders/**): recorded, not checked by this runner\n');
    expect(lines).toContain(
      'RECORDED WAIVER #5 STA-002 (route /?screen=orders): recorded, not checked by this runner, expired after 2026-01-01',
    );
    expect(lines).not.toMatch(/UNUSED WAIVER #[45]/);
    expect(waiverReport({ waivers: [] }, runner)).toBeUndefined();
  });

  it('matches rendered screens by the exact route or, in menu mode, the exact menu label; an entry with both in either mode', () => {
    const [byRoute, byMenu, byBoth] = parse([
      entry({ screen: { route: '/?screen=orders' } }),
      entry({ screen: { menu: 'Orders' } }),
      entry({ screen: { route: '/?screen=orders', menu: 'Orders' } }),
    ]);
    expect(coversRendered('route')(byRoute, { route: '/?screen=orders' })).toBe(true);
    expect(coversRendered('route')(byRoute, { route: '/?screen=order' })).toBe(false);
    expect(coversRendered('route')(byMenu, { route: 'Orders' })).toBe(false);
    expect(coversRendered('menu')(byMenu, { route: 'Orders' })).toBe(true);
    expect(coversRendered('route')(byBoth, { route: '/?screen=orders' })).toBe(true);
    expect(coversRendered('menu')(byBoth, { route: 'Orders' })).toBe(true);
  });

  it('reports a render entry whose screen key cannot apply to the run mode, never as unused', () => {
    const waivers = parse([
      entry({ gate: 'LAY-005', screen: { route: '/?screen=orders' } }),
      entry({ gate: 'LAY-005', screen: { menu: 'Orders' } }),
      entry({ gate: 'LAY-005', screen: { route: '/?screen=orders', menu: 'Orders' } }),
      entry({ gate: 'LAY-005', screen: { source: 'src/**' } }),
    ]);
    const report = (mode: 'route' | 'menu') =>
      waiverReport(
        { file: 'design-waivers.json', waivers },
        { mode, gates: ['LAY-005'], exercised: [mode === 'route' ? '/?screen=orders' : 'Orders'] },
      );
    const routeMode = report('route');
    expect(routeMode?.unused.map((w) => w.index)).toEqual([0, 2]);
    expect(routeMode?.notApplicable.map((w) => [w.index, w.needs])).toEqual([
      [1, 'needs --menu'],
      [3, 'needs screen.route or screen.menu'],
    ]);
    expect(waiverLines(routeMode).join('\n')).toContain(
      'WAIVER #1 LAY-005 (menu Orders): not applicable to this run (needs --menu)',
    );
    const menuMode = report('menu');
    expect(menuMode?.unused.map((w) => w.index)).toEqual([1, 2]);
    expect(menuMode?.notApplicable.map((w) => [w.index, w.needs])).toEqual([
      [0, 'needs route mode (--routes, no --menu)'],
      [3, 'needs screen.route or screen.menu'],
    ]);
  });
});
