// @vitest-environment node
// Unit tests for the runner's pure layers (config, report, chrome parsing)
// and its CDP protocol handling via an injected fake WebSocket. The
// browser-driving CLI itself is exercised end-to-end against a real app, not
// here - these tests pin the logic every run depends on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../runner/cli.mjs';
import {
  DEFAULTS,
  expandMatrix,
  parseArgs,
  resolvePaths,
  resolveServerCwd,
  routeSlug,
  shotName,
} from '../runner/config.mjs';
import {
  buildReport,
  diffReports,
  exitCode,
  gateLookup,
  measuredScreens,
  splitSweep,
  summaryLines,
  sweepState,
  waiveStates,
} from '../runner/report.mjs';
import { readSkillJson } from '../runner/skill.mjs';
import { diffStatic, staticExitCode } from '../runner/static.mjs';
import { appliedThemeExpression, STUDIO_THEME_KEY, themeMismatch, themeSeedExpression } from '../runner/theme.mjs';
import { coversRendered, parseWaivers, waiverLines, waiverReport } from '../runner/waivers.mjs';
import {
  CHROME_CANDIDATES,
  discoverCacheChromes,
  findChrome,
  parseDevtoolsEndpoint,
} from '../runner/chrome.mjs';
import { CdpSession } from '../runner/cdp.mjs';
import { isUrlReachable } from '../runner/server.mjs';

// The CLI's own wiring up to the first browser or server step: every input
// it cannot honour exits 2 before the server wait and the Chrome lookup. A
// run that got past the inputs would reach them, and an unreachable --url
// with a 1 ms wait and a missing --chrome keep that failure quick and loud.
describe('cli main: inputs checked before any browser work', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function runCli(files: Record<string, string>, args: string[]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-verify-cli-'));
    dirs.push(root);
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(root, file), text);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const at = (file: string) => path.join(root, file);
    const code = await main([...args.map((a) => (a.startsWith('@') ? at(a.slice(1)) : a)), '--chrome', at('no-chrome')]);
    return { code, errors: errors.join('\n'), logged: log.mock.calls.flat().join('\n') };
  }

  const DESIGN = [
    '---',
    'name: "Fixture"',
    'version: "0.0.0"',
    'description: "x"',
    'colors:',
    '  fg: "var(--fg)"',
    'components:',
    '  card:',
    '    textColor: "{colors.fg}"',
    '    backgroundColor: "{colors.nope}"',
    '---',
    '',
  ].join('\n');

  it.each([
    [
      'a waiver file with an error',
      { 'w.json': JSON.stringify({ waivers: [{ gate: 'COL-001', screen: { route: '/' }, reason: 'x' }] }) },
      ['--waivers', '@w.json'],
      /^design-verify: .*w\.json: waivers\[0\]: gate COL-001 has waiver "never"/,
    ],
    [
      'an out-of-range waiver date',
      { 'w.json': JSON.stringify({ waivers: [{ gate: 'LAY-005', screen: { route: '/' }, reason: 'x', until: '2026-13-01' }] }) },
      ['--waivers', '@w.json'],
      /waivers\[0\]: "until" must be a date/,
    ],
    ['a DESIGN.md the parser refuses', { 'DESIGN.md': '# no front matter\n' }, ['--design-md', '@DESIGN.md'], /^design-verify: DESIGN\.md has no front matter/],
    [
      'a DESIGN.md pair that names no token',
      { 'DESIGN.md': DESIGN },
      ['--design-md', '@DESIGN.md'],
      /^design-verify: DESIGN\.md components\.card\.backgroundColor: "\{colors\.nope\}" resolves to no var/,
    ],
    ['an unknown flag', {}, ['--nope'], /unknown flag/],
  ])('exits 2 on %s', async (_name, files, args, message) => {
    const result = await runCli(files, [...args, '--url', 'http://127.0.0.1:9/', '--server-timeout-ms', '1']);
    expect(result.errors).toMatch(message);
    expect(result.errors).not.toMatch(/\n\s+at /);
    expect(result.logged).not.toMatch(/launching headless Chrome|waiting for/);
    expect(result.code).toBe(2);
  });
});

describe('config', () => {
  it('parses the full flag surface', () => {
    const { config, errors } = parseArgs([
      '--url', 'http://127.0.0.1:5174/',
      '--routes', '/login,/tasks',
      '--widths', '1440,320',
      '--themes', 'light,dark',
      '--theme-key', 'custom:key',
      '--out', 'shots',
      '--start-server', 'npm run dev:all',
      '--server-cwd', '/apps/best-app',
      '--fail-on-findings',
      '--no-screenshots',
    ]);
    expect(errors).toEqual([]);
    expect(config).toMatchObject({
      url: 'http://127.0.0.1:5174/',
      routes: ['/login', '/tasks'],
      widths: [1440, 320],
      themes: ['light', 'dark'],
      themeKey: 'custom:key',
      outDir: 'shots',
      startServer: 'npm run dev:all',
      serverCwd: '/apps/best-app',
      failOnFindings: true,
      screenshots: false,
    });
  });

  // APP-005 checks 1440, 768 and 390; LAY-002 needs the 320 px floor. The
  // matrix a flagless run sweeps, not the constants it is built from.
  it('sweeps the root route in both themes at the APP-005 widths and the LAY-002 floor by default', () => {
    const states = expandMatrix(parseArgs([]).config).map((s) => `${s.route} ${s.theme} ${s.width}`);
    expect(states).toEqual([
      '/ light 1440', '/ light 768', '/ light 390', '/ light 320',
      '/ dark 1440', '/ dark 768', '/ dark 390', '/ dark 320',
    ]);
  });

  // The shell restores its theme from `frontx:theme`
  // (template-shell src-app/app/themes/themePersistence.ts); Studio is a dev
  // tool and may be absent.
  it('seeds the theme under the key the shell reads by default', () => {
    expect(parseArgs([]).config.themeKey).toBe('frontx:theme');
  });

  // The runner writes Studio's key as JSON, which would overwrite the raw id
  // the check then reads back: every state would report a mismatch.
  it('rejects Studio\'s key as --theme-key and names the shell key', () => {
    const { config, errors } = parseArgs(['--theme-key', 'frontx:studio:theme']);
    expect(errors).toEqual([expect.stringMatching(/frontx:studio:theme is FrontX Studio's own key.*frontx:theme/)]);
    expect(config.themeKey).toBe('frontx:theme');
  });

  // The shell's Vite listens on `localhost`, which can be ::1 only.
  it('attaches to the dev server at Vite\'s default host', () => {
    expect(DEFAULTS.url).toBe('http://localhost:5173/');
  });

  it('applies defaults and rejects unknown flags and bad values', () => {
    expect(parseArgs([]).config.failOnFindings).toBe(false);
    // Screenshots are opt-in: findings.json is the evidence channel.
    expect(parseArgs([]).config.screenshots).toBe(false);
    expect(parseArgs(['--screenshots']).config.screenshots).toBe(true);
    expect(parseArgs(['--nope']).errors[0]).toMatch(/unknown flag/);
    expect(parseArgs(['--widths', '1440,huge']).errors[0]).toMatch(/positive integers/);
    // parseInt would silently truncate these; the parser must refuse them.
    expect(parseArgs(['--widths', '1.5']).errors[0]).toMatch(/positive integers/);
    expect(parseArgs(['--widths', '1440px']).errors[0]).toMatch(/positive integers/);
    expect(parseArgs(['--settle-ms', '700ms']).errors[0]).toMatch(/non-negative integer/);
    expect(parseArgs(['--sweep-timeout-ms', '1e3']).errors[0]).toMatch(/non-negative integer/);
    expect(parseArgs(['--settle-ms', ' 700 ']).config.settleMs).toBe(700);
    expect(parseArgs(['--routes']).errors[0]).toMatch(/needs a value/);
  });

  it('expands the matrix route-outermost, width-innermost', () => {
    const states = expandMatrix({ routes: ['/a'], themes: ['light', 'dark'], widths: [1440, 320] });
    expect(states).toEqual([
      { route: '/a', theme: 'light', width: 1440 },
      { route: '/a', theme: 'light', width: 320 },
      { route: '/a', theme: 'dark', width: 1440 },
      { route: '/a', theme: 'dark', width: 320 },
    ]);
  });

  it('parses --menu labels for action-mounted shells', () => {
    const { config, errors } = parseArgs(['--menu', 'Overview, Audit Log']);
    expect(errors).toEqual([]);
    expect(config.menus).toEqual(['Overview', 'Audit Log']);
    expect(parseArgs([]).config.menus).toEqual([]);
  });

  it('runs --start-server from the flag, then npm invocation dir, then cwd', () => {
    // npm runs workspace scripts with cwd inside the package, where the app's
    // dev script does not exist — INIT_CWD points back at the invocation dir.
    expect(resolveServerCwd({ serverCwd: '/explicit' }, { INIT_CWD: '/root' }, '/pkg')).toBe('/explicit');
    expect(resolveServerCwd({ serverCwd: '' }, { INIT_CWD: '/root' }, '/pkg')).toBe('/root');
    expect(resolveServerCwd({ serverCwd: '' }, {}, '/pkg')).toBe('/pkg');
  });

  it('resolves --out, --baseline, --waivers and --server-cwd against the project root', () => {
    const { config } = parseArgs(['--waivers', 'w.json', '--baseline', '/abs/b.json', '--server-cwd', 'app']);
    expect(config.waivers).toBe('w.json');
    expect(resolvePaths(config, '/repo')).toMatchObject({
      outDir: '/repo/design-verify-report',
      baseline: '/abs/b.json',
      waivers: '/repo/w.json',
      serverCwd: '/repo/app',
    });
    expect(resolvePaths(parseArgs([]).config, '/repo')).toMatchObject({ baseline: '', waivers: '', serverCwd: '' });
  });

  it('names screenshots stably, with a root fallback slug', () => {
    expect(shotName('/tasks', 'dark', 320)).toBe('tasks-dark-320.png');
    expect(shotName('/a/b?c=1', 'light', 1440)).toBe('a-b-c-1-light-1440.png');
    expect(routeSlug('/')).toBe('root');
  });
});

describe('theme', () => {
  const pageWith = (storage: Map<string, string>, attributes: Record<string, string> = {}) => ({
    localStorage: {
      setItem: (key: string, value: string) => void storage.set(key, String(value)),
      getItem: (key: string) => storage.get(key) ?? null,
    },
    document: { documentElement: { getAttribute: (name: string) => attributes[name] ?? null } },
  });

  // The shell reads a raw id; Studio reads its own key as JSON and applies
  // it over the shell's after mount, so a stale Studio value would win.
  it('stores the raw theme id under the shell key and the JSON id under Studio\'s key', () => {
    const storage = new Map([[STUDIO_THEME_KEY, '"light"']]);
    vm.runInNewContext(themeSeedExpression('frontx:theme', 'dark'), pageWith(storage));
    expect(Object.fromEntries(storage)).toEqual({ 'frontx:theme': 'dark', 'frontx:studio:theme': '"dark"' });
  });

  it('reads data-theme-id, data-theme and the stored id from the page', () => {
    const storage = new Map([['frontx:theme', 'dark']]);
    const page = pageWith(storage, { 'data-theme-id': 'dracula', 'data-theme': 'dark' });
    const value = vm.runInNewContext(appliedThemeExpression('frontx:theme'), page);
    expect({ ...value }).toEqual({ id: 'dracula', attribute: 'dark', stored: 'dark' });
  });

  // Only the id the app stamps decides; storage is the runner's own input.
  it('measures a state whose page stamps the requested id', () => {
    const read = { value: { id: 'dracula', attribute: 'dark', stored: 'dark' } };
    expect(themeMismatch('dracula', read, 'frontx:theme')).toBeUndefined();
  });

  it('fails a state whose page stamps another id, whatever storage holds', () => {
    const read = { value: { id: 'default', attribute: 'light', stored: 'drakula' } };
    expect(themeMismatch('drakula', read, 'frontx:theme')).toBe(
      'theme not applied: requested "drakula", the page shows data-theme-id="default" (data-theme="light"; ' +
        'localStorage "frontx:theme" holds "drakula"); is "frontx:theme" the key the app restores its theme from, ' +
        'and "drakula" a registered theme id?',
    );
  });

  it('fails a state whose page does not stamp data-theme-id, and says the app must', () => {
    const result = themeMismatch('dark', { value: { id: null, attribute: 'dark', stored: 'dark' } }, 'frontx:theme');
    expect(result).toMatch(/^theme not confirmed: requested "dark", the page has no data-theme-id on <html>/);
    expect(result).toMatch(/the app must stamp the applied theme's registry id there/);
    expect(result).toMatch(/references\/verify\.md, "Theme id stamp"/);
  });

  // The whole round trip with the shell's own boot code: the runner seeds the
  // id, the shell's applyPersistedTheme (src-app/app/themes/themePersistence.ts,
  // three directories up in the composed app) restores it into a registry
  // holding the shell's ids, stampAppliedThemeId (themeIdAttribute.ts) names
  // the theme that took on <html>, and the runner reads back what the page
  // shows. An id the registry does not hold boots the fallback, so the run is
  // an environment failure, never a clean pass in the fallback theme.
  // A project seeded from an older shell has no themeIdAttribute.ts, so these
  // tests skip there, saying why, instead of failing to load the module.
  const shellThemes = new URL('../../../app/themes/', import.meta.url);
  const shellModules = ['themePersistence.ts', 'themeIdAttribute.ts'];
  const shellMissing = shellModules.filter((file) => !fs.existsSync(new URL(file, shellThemes)));
  const shellPresent = shellMissing.length === 0;
  const skipReason = shellPresent ? '' : ` (skipped: an older shell, no src-app/app/themes/${shellMissing.join(' or ')})`;

  describe.skipIf(!shellPresent)(`round trip through the shell boot${skipReason}`, () => {
    afterEach(() => vi.unstubAllGlobals());

    async function boot(requested: string, themeKey = 'frontx:theme') {
      const [{ applyPersistedTheme }, { stampAppliedThemeId }] = await Promise.all(
        shellModules.map((file) => import(/* @vite-ignore */ new URL(file, shellThemes).href)),
      );
      const storage = new Map<string, string>();
      const attributes: Record<string, string> = {};
      const appearance: Record<string, string> = { default: 'light', light: 'light', dark: 'dark', dracula: 'dark' };
      vm.runInNewContext(themeSeedExpression(themeKey, requested), pageWith(storage));
      const page = pageWith(storage, attributes);
      vi.stubGlobal('window', { localStorage: page.localStorage });
      vi.stubGlobal('document', {
        documentElement: {
          setAttribute: (name: string, value: string) => void (attributes[name] = value),
          removeAttribute: (name: string) => void delete attributes[name],
        },
      });

      // The registry surface applyPersistedTheme uses, keyed by the shell's ids.
      let current: { id: string } | undefined;
      const listeners: Array<() => void> = [];
      const registry = {
        get: (id: string) => (id in appearance ? { id } : undefined),
        getCurrent: () => current,
        apply: (id: string) => {
          current = { id };
          attributes['data-theme'] = appearance[id];
          for (const listener of listeners) listener();
        },
        subscribe: (listener: () => void) => void listeners.push(listener),
      };
      applyPersistedTheme(registry, 'default');
      stampAppliedThemeId(registry);

      const applied = { value: vm.runInNewContext(appliedThemeExpression(themeKey), page) };
      const state = sweepState({ route: '/', theme: requested, width: 1440 }, {
        applied, themeKey, sweep: { value: [] }, gateFor: () => 'APP-005', waivers: [], coversState: () => false,
      });
      return { state, code: exitCode(buildReport({ baseUrl: 'u', themeKey }, [state]), { failOnFindings: true }) };
    }

    it('fails the run as an environment failure for an id the shell has not registered', async () => {
      const { state, code } = await boot('drakula');
      expect(state.environmentError).toMatch(/requested "drakula", the page shows data-theme-id="default" \(data-theme="light"/);
      expect(code).toBe(2);
    });

    // The shell never reads the seeded key, but the runner's own seed sits
    // there: only the stamped id can tell the page booted the fallback.
    it('fails the run for an unused --theme-key, whatever the runner seeded there', async () => {
      const { state, code } = await boot('drakula', 'unused:key');
      expect(state.environmentError).toMatch(/requested "drakula", the page shows data-theme-id="default"/);
      expect(state.environmentError).toMatch(/localStorage "unused:key" holds "drakula"/);
      expect(code).toBe(2);
    });

    it('passes a registered custom id', async () => {
      const { state, code } = await boot('dracula');
      expect(state).toMatchObject({ appliedTheme: 'dracula' });
      expect(state.environmentError).toBeUndefined();
      expect(code).toBe(0);
    });
  });
});

describe('sweepState', () => {
  const gateFor = gateLookup(readSkillJson('rules/render-check.json'));
  const input = (applied: object, sweep: object) => ({
    applied, themeKey: 'frontx:theme', sweep, gateFor, waivers: [], coversState: () => false,
  });
  const defect = { id: 'page-horizontal-scroll', detail: '12px' };

  it('fills a state from the sweep of a page in the requested theme', () => {
    const state = sweepState(
      { route: '/', theme: 'dark', width: 1440 },
      input({ value: { id: 'dark', attribute: 'dark', stored: 'dark' } }, { value: [defect] }),
    );
    expect(state).toEqual({
      route: '/', theme: 'dark', width: 1440, appliedTheme: 'dark',
      findings: [{ ...defect, gate: 'LAY-002' }], needsReview: [],
    });
  });

  // The defect sweep ran, but on the light theme: never clean for dark.
  it('fails a state whose page is in another theme, whatever the sweep found', () => {
    const state = sweepState(
      { route: '/', theme: 'dark', width: 1440 },
      input({ value: { id: 'light', attribute: 'light', stored: 'light' } }, { value: [] }),
    );
    expect(state).not.toHaveProperty('findings');
    expect(state.appliedTheme).toBe('light');
    expect(state.environmentError).toMatch(/^theme not applied: requested "dark", the page shows data-theme-id="light"/);
    const report = buildReport({ baseUrl: 'u', themeKey: 'frontx:theme' }, [state]);
    expect(report.summary).toMatchObject({ statesClean: 0 });
    expect(exitCode(report, { failOnFindings: false })).toBe(2);
  });

  it('keeps the sweep failures it reported before', () => {
    const inDark = { value: { id: 'dark', attribute: 'dark', stored: 'dark' } };
    const record = () => ({ route: '/', theme: 'dark', width: 1440 });
    expect(sweepState(record(), input(inDark, { error: 'TypeError: window.__frontxDesignDefects is not a function' })).environmentError).toMatch(
      /^window\.__frontxDesignDefects is unavailable/,
    );
    expect(sweepState(record(), input(inDark, { error: 'boom' })).environmentError).toBe('sweep threw: boom');
    expect(sweepState(record(), input(inDark, { value: 3 })).environmentError).toBe('sweep returned a non-array: 3');
  });
});

describe('report', () => {
  const clean = { route: '/', theme: 'light', width: 1440, findings: [] };
  const dirty = {
    route: '/',
    theme: 'dark',
    width: 320,
    findings: [{ id: 'page-horizontal-scroll', detail: 'body overflows' }, { id: 'tiny-text', detail: '8px' }],
  };
  const broken = { route: '/x', theme: 'light', width: 1440, environmentError: 'checker unavailable' };

  it('aggregates counts by rule and separates environment failures', () => {
    const report = buildReport({ baseUrl: 'http://x/', themeKey: 'k' }, [clean, dirty, broken]);
    expect(report.summary).toEqual({
      statesRun: 3,
      statesClean: 1,
      environmentFailures: 1,
      screenshotFailures: 0,
      totalFindings: 2,
      needsReview: 0,
      waived: 0,
      byRule: { 'page-horizontal-scroll': 1, 'tiny-text': 1 },
      byGate: {},
    });
    expect(summaryLines(report).join('\n')).toContain('ENVIRONMENT /x light 1440px');
  });

  // A check the checker could not decide (axe's incomplete contrast) is not a
  // defect, so it neither counts as a finding nor gates --fail-on-findings;
  // it is not a pass either, so its state is not clean.
  it('keeps undecided checks out of the findings and their state out of clean', () => {
    const meta = { baseUrl: 'u', themeKey: 'k' };
    const undecided = { id: 'axe-incomplete/color-contrast', detail: 'background gradient', target: 'p.synced', kind: 'needs-review' };
    const defect = { id: 'tiny-text', detail: '8px' };
    expect(splitSweep([defect, undecided])).toEqual({ findings: [defect], needsReview: [undecided] });

    const review = { route: '/', theme: 'light', width: 320, ...splitSweep([undecided]) };
    const report = buildReport(meta, [clean, review]);
    expect(report.summary).toMatchObject({ statesRun: 2, statesClean: 1, totalFindings: 0, needsReview: 1, byRule: {} });
    expect(exitCode(report, { failOnFindings: true })).toBe(0);
    expect(exitCode(report, { failOnFindings: true }, diffReports(report, report))).toBe(0);
    const summary = summaryLines(report).join('\n');
    expect(summary).toContain('0 finding(s), 1 needing review');
    expect(summary).toContain('NEEDS REVIEW / light 320px: axe-incomplete/color-contrast @ p.synced');
  });

  // The gate comes from the skill's rules/render-check.json, the one table.
  it('tags every entry with its gate, unmapped ids included', () => {
    const gateFor = gateLookup(readSkillJson('rules/render-check.json'));
    expect(gateFor('page-horizontal-scroll')).toBe('LAY-002');
    expect(gateFor('axe/color-contrast')).toBe('COL-001');
    expect(gateFor('axe/heading-order')).toBe('unmapped');
    const { findings, needsReview } = splitSweep(
      [{ id: 'tiny-text' }, { id: 'axe-incomplete/color-contrast', kind: 'needs-review' }],
      gateFor,
    );
    expect(findings).toEqual([{ id: 'tiny-text', gate: 'TYP-001' }]);
    expect(needsReview[0].gate).toBe('COL-001');
    const report = buildReport({ baseUrl: 'u', themeKey: 'k' }, [{ route: '/', theme: 'light', width: 320, findings }]);
    expect(report.summary.byGate).toEqual({ 'TYP-001': 1 });
    expect(summaryLines(report).join('\n')).toContain('gate TYP-001: 1');
  });

  // A waived finding leaves the findings, so it neither gates nor enters the
  // baseline diff, but the report keeps it with the reason.
  it('moves waived findings out of the findings and keeps them in the report', () => {
    const registry = readSkillJson('rules/quality-gates.json');
    const waivers = parseWaivers(
      {
        waivers: [
          { gate: 'LAY-005', screen: { route: '/orders-screen' }, reason: 'Two kit sizes on purpose.' },
          { gate: 'LAY-005', screen: { route: '/quiet' }, reason: 'Unused.' },
          { gate: 'LAY-005', screen: { source: 'src/**' }, reason: 'For the static check.' },
          { gate: 'LAY-005', screen: { route: '/never-swept' }, reason: 'Not exercised.' },
        ],
      },
      registry,
      { file: 'design-waivers.json', today: '2026-11-06' },
    );
    const mismatch = { id: 'control-height-mismatch', gate: 'LAY-005', target: 'div.row' };
    const tiny = { id: 'tiny-text', gate: 'TYP-001', target: 'p' };
    const states = [
      { route: '/orders-screen', theme: 'light', width: 1440, findings: [mismatch, tiny] },
      { route: '/other', theme: 'light', width: 1440, findings: [mismatch] },
      { route: '/quiet', theme: 'light', width: 1440, findings: [] },
    ];
    waiveStates(states, waivers, coversRendered('route'));
    expect(states[0].findings).toEqual([tiny]);
    expect(states[0]).toMatchObject({ waived: [{ ...mismatch, waiver: { index: 0, reason: 'Two kit sizes on purpose.' } }] });
    expect(states[1].findings).toEqual([mismatch]);

    const report = buildReport(
      {
        baseUrl: 'u',
        themeKey: 'k',
        waivers: waiverReport(
          { file: 'design-waivers.json', waivers },
          { mode: 'route', gates: ['LAY-005', 'TYP-001'], exercised: measuredScreens(states) },
        ),
      },
      states,
    );
    expect(report.summary).toMatchObject({ totalFindings: 2, waived: 1 });
    expect(report.waivers).toMatchObject({
      applied: 1,
      notApplicable: [
        { index: 2, needs: 'needs screen.route or screen.menu' },
        { index: 3, needs: 'needs --routes /never-swept' },
      ],
    });
    expect((report.waivers as { unused: Array<{ index: number }> }).unused.map((w) => w.index)).toEqual([1]);
    const lines = summaryLines(report).join('\n');
    expect(lines).toContain('2 finding(s), 0 needing review, 1 waived');
    expect(lines).toContain('WAIVED /orders-screen light 1440px: LAY-005 control-height-mismatch @ div.row - waiver #0: Two kit sizes on purpose.');
    expect(lines).toContain('UNUSED WAIVER #1 LAY-005 (route /quiet): matched no finding in this run');
    // A route the run never swept is no evidence the deviation is gone.
    expect(lines).toContain('WAIVER #3 LAY-005 (route /never-swept): not applicable to this run (needs --routes /never-swept)');
    expect(lines).not.toContain('UNUSED WAIVER #3');
    // Against a baseline that has all three, the waived one reads as resolved, never new.
    const before = buildReport({ baseUrl: 'u', themeKey: 'k' }, [
      { route: '/orders-screen', theme: 'light', width: 1440, findings: [mismatch, tiny] },
      { route: '/other', theme: 'light', width: 1440, findings: [mismatch] },
    ]);
    const diff = diffReports(before, report);
    expect(diff.new).toEqual([]);
    expect(exitCode(report, { failOnFindings: true }, diff)).toBe(0);
  });

  it('judges render waivers only against screens with a measured sweep', () => {
    const registry = readSkillJson('rules/quality-gates.json');
    const waivers = parseWaivers(
      {
        waivers: [
          { gate: 'LAY-005', screen: { route: '/login' }, reason: 'Measured, nothing matched.' },
          { gate: 'LAY-005', screen: { route: '/orders' }, reason: 'Never asked for.' },
          { gate: 'LAY-005', screen: { route: '/broken' }, reason: 'Asked for, never measured.', until: '2026-01-01' },
        ],
      },
      registry,
      { file: 'design-waivers.json', today: '2026-11-06' },
    );
    const states = [
      { route: '/login', theme: 'light', width: 1440, findings: [] },
      { route: '/broken', theme: 'light', width: 1440, environmentError: 'page did not load' },
      { check: 'design-md-contrast', route: 'DESIGN.md', theme: 'light', findings: [] },
    ];
    expect(measuredScreens(states)).toEqual(['/login']);
    const section = waiverReport(
      { file: 'design-waivers.json', waivers },
      { mode: 'route', gates: ['LAY-005'], exercised: measuredScreens(states), requested: ['/login', '/broken'] },
    );
    expect(section?.unused.map((w) => w.index)).toEqual([0]);
    expect(section?.notApplicable.map((w) => [w.index, w.needs])).toEqual([
      [1, 'needs --routes /orders'],
      [2, 'needs a measured state of /broken; each one had an environment failure'],
    ]);
    expect(waiverLines(section).join('\n')).toContain(
      'WAIVER #2 LAY-005 (route /broken): not applicable to this run ' +
        '(needs a measured state of /broken; each one had an environment failure), expired after 2026-01-01',
    );
    const menu = parseWaivers(
      { waivers: [{ gate: 'LAY-005', screen: { menu: 'Billing' }, reason: 'Not swept.' }] },
      registry,
      { file: 'design-waivers.json', today: '2026-11-06' },
    );
    const menuSection = waiverReport(
      { file: 'design-waivers.json', waivers: menu },
      { mode: 'menu', gates: ['LAY-005'], exercised: ['Orders'], requested: ['Orders'] },
    );
    expect(menuSection?.notApplicable.map((w) => w.needs)).toEqual(['needs --menu Billing']);
    expect(menuSection?.unused).toEqual([]);
  });

  it('parses --baseline as a value flag', () => {
    expect(parseArgs(['--baseline', 'prior/findings.json']).config.baseline).toBe(
      'prior/findings.json',
    );
    expect(parseArgs([]).config.baseline).toBe('');
    expect(parseArgs(['--baseline']).errors[0]).toMatch(/needs a value/);
  });

  it('diffs runs by state + rule + target, ignoring the jittery detail text', () => {
    const meta = { baseUrl: 'u', themeKey: 'k' };
    const finding = (id: string, target: string, detail: string) => ({ id, target, detail });
    const baseline = buildReport(meta, [
      {
        route: '/a', theme: 'light', width: 320,
        findings: [finding('tiny-text', 'p.hint', '8px'), finding('clipped-text', 'h1', 'clip')],
      },
    ]);
    const current = buildReport(meta, [
      {
        route: '/a', theme: 'light', width: 320,
        // Same identity as the baseline's tiny-text, different measurement.
        findings: [finding('tiny-text', 'p.hint', '9px'), finding('skipped-heading', 'h3', 'h1->h3')],
      },
      // A state the baseline never swept: its findings count as new.
      { route: '/b', theme: 'dark', width: 1440, findings: [finding('tiny-text', 'em', '7px')] },
    ]);
    const diff = diffReports(baseline, current);
    expect(diff.carriedOver).toBe(1);
    expect(diff.new.map((f) => [f.route, f.id])).toEqual([
      ['/a', 'skipped-heading'],
      ['/b', 'tiny-text'],
    ]);
    expect(diff.resolved.map((f) => f.id)).toEqual(['clipped-text']);
    expect(diff.unverified).toEqual([]);
    expect(summaryLines(current, diff).join('\n')).toContain(
      '2 new, 1 resolved, 0 unverified, 1 carried over',
    );

    // With a baseline, --fail-on-findings gates on new findings only.
    expect(exitCode(current, { failOnFindings: true }, diff)).toBe(1);
    const allKnown = diffReports(current, current);
    expect(exitCode(current, { failOnFindings: true }, allKnown)).toBe(0);
    expect(exitCode(current, { failOnFindings: true })).toBe(1);
  });

  // Two identical cards each missing padding are two findings with one key.
  // A plain Map would keep one and let the second instance arrive unreported,
  // so a baseline with one and a run with two must report the extra as new,
  // and a run that drops from two to one must report one resolved, not zero.
  it('compares findings as a multiset: extra instances are new, fewer are resolved', () => {
    const meta = { baseUrl: 'u', themeKey: 'k' };
    const pad = { id: 'card-missing-padding', target: 'div.card', detail: 'left 0px' };
    const state = (findings: object[]) => ({ route: '/a', theme: 'light', width: 320, findings });
    const one = buildReport(meta, [state([pad])]);
    const two = buildReport(meta, [state([pad, pad])]);

    const grew = diffReports(one, two);
    expect(grew.new).toEqual([expect.objectContaining({ id: 'card-missing-padding', count: 1 })]);
    expect(grew.resolved).toEqual([]);
    expect(grew.carriedOver).toBe(1);
    expect(exitCode(two, { failOnFindings: true }, grew)).toBe(1);
    expect(summaryLines(two, grew).join('\n')).toContain('1 new, 0 resolved, 0 unverified, 1 carried over');

    const shrank = diffReports(two, one);
    expect(shrank.new).toEqual([]);
    expect(shrank.resolved).toEqual([expect.objectContaining({ id: 'card-missing-padding', count: 1 })]);
    expect(shrank.carriedOver).toBe(1);

    // Both instances new at once: the count travels with the entry and the
    // summary line shows the multiplicity.
    const fromNothing = diffReports(buildReport(meta, [state([])]), two);
    expect(fromNothing.new).toEqual([expect.objectContaining({ count: 2 })]);
    expect(summaryLines(two, fromNothing).join('\n')).toContain('NEW /a light 320px: card-missing-padding @ div.card (x2)');
  });

  // Absence is only evidence when the state was re-observed. A baseline
  // finding whose state hit an environment error now, or was left out of a
  // narrower matrix, is unverified - never resolved.
  it('does not resolve findings in states the current run did not complete', () => {
    const meta = { baseUrl: 'u', themeKey: 'k' };
    const f = { id: 'tiny-text', target: 'p.hint', detail: '8px' };
    const baseline = buildReport(meta, [
      { route: '/a', theme: 'light', width: 320, findings: [f] },
      { route: '/b', theme: 'dark', width: 1440, findings: [f] },
      { route: '/c', theme: 'light', width: 768, findings: [f] },
    ]);
    const current = buildReport(meta, [
      // /a re-observed clean: resolved.
      { route: '/a', theme: 'light', width: 320, findings: [] },
      // /b could not be swept: unverified, not resolved.
      { route: '/b', theme: 'dark', width: 1440, environmentError: 'checker unavailable' },
      // /c not in this run's matrix at all: unverified.
    ]);
    const diff = diffReports(baseline, current);
    expect(diff.resolved.map((e) => e.route)).toEqual(['/a']);
    expect(diff.unverified.map((e) => e.route)).toEqual(['/b', '/c']);
    expect(diff.new).toEqual([]);
    const lines = summaryLines(current, diff).join('\n');
    expect(lines).toContain('0 new, 1 resolved, 2 unverified, 0 carried over');
    expect(lines).toContain('UNVERIFIED /b dark 1440px: tiny-text @ p.hint');
    expect(lines).toContain('UNVERIFIED /c light 768px: tiny-text @ p.hint');
    // The environment failure still owns the exit code.
    expect(exitCode(current, { failOnFindings: true }, diff)).toBe(2);
  });

  it('exit codes: environment failure always wins; findings gate only when asked', () => {
    const meta = { baseUrl: 'u', themeKey: 'k' };
    expect(exitCode(buildReport(meta, [clean, dirty]), { failOnFindings: false })).toBe(0);
    expect(exitCode(buildReport(meta, [clean, dirty]), { failOnFindings: true })).toBe(1);
    expect(exitCode(buildReport(meta, [dirty, broken]), { failOnFindings: false })).toBe(2);
    expect(exitCode(buildReport(meta, [clean]), { failOnFindings: true })).toBe(0);
  });

  // A screenshot the run was asked for and could not produce is missing
  // evidence: the closing visual review cannot happen over it, so the state is
  // not clean and the run must not exit 0 - even when the sweep itself found
  // nothing and --fail-on-findings is off.
  it('treats a failed requested screenshot as incomplete verification (exit 2)', () => {
    const meta = { baseUrl: 'u', themeKey: 'k' };
    const shotLost = {
      route: '/', theme: 'light', width: 1440, findings: [], screenshotError: 'ENOSPC: disk full',
    };
    const report = buildReport(meta, [clean, shotLost]);
    expect(report.summary).toMatchObject({
      statesRun: 2,
      statesClean: 1,
      environmentFailures: 0,
      screenshotFailures: 1,
      totalFindings: 0,
    });
    expect(exitCode(report, { failOnFindings: false })).toBe(2);
    expect(exitCode(report, { failOnFindings: true }, diffReports(report, report))).toBe(2);
    expect(summaryLines(report).join('\n')).toContain('SCREENSHOT / light 1440px: ENOSPC: disk full');
    expect(summaryLines(report)[0]).toContain('1 screenshot failure(s)');
    // A captured screenshot is not a failure.
    const shotOk = { ...clean, screenshot: 'root-light-1440.png' };
    expect(buildReport(meta, [shotOk]).summary).toMatchObject({ statesClean: 1, screenshotFailures: 0 });
  });
});

describe('server', () => {
  it('reports reachability as a boolean, any HTTP answer counting as up', async () => {
    await expect(isUrlReachable('http://x/', { fetchImpl: async () => ({}) as never })).resolves.toBe(true);
    await expect(
      isUrlReachable('http://x/', { fetchImpl: async () => { throw new Error('refused'); } }),
    ).resolves.toBe(false);
  });
});

describe('chrome', () => {
  it('parses the DevTools endpoint from startup stderr', () => {
    expect(
      parseDevtoolsEndpoint('DevTools listening on ws://127.0.0.1:39511/devtools/browser/ab-cd\n'),
    ).toBe('http://127.0.0.1:39511');
    expect(parseDevtoolsEndpoint('starting up...')).toBeUndefined();
  });

  it('resolves the executable by explicit path, then $CHROME_PATH, then candidates', () => {
    const exists = (p: string) => p === '/custom/chrome' || p === CHROME_CANDIDATES[1];
    expect(findChrome({ chromePath: '/custom/chrome', env: {}, exists })).toBe('/custom/chrome');
    expect(findChrome({ env: { CHROME_PATH: '/custom/chrome' }, exists })).toBe('/custom/chrome');
    expect(findChrome({ env: {}, exists })).toBe(CHROME_CANDIDATES[1]);
    expect(() => findChrome({ env: {}, exists: () => false })).toThrow(/--cdp-url/);
  });

  it('discovers Playwright/Puppeteer cache browsers, newest revision first', () => {
    const dirs: Record<string, string[]> = {
      // 999 vs 1000 and 99 vs 115: a string sort would rank the shorter,
      // older revisions first.
      '/h/.cache/ms-playwright': ['chromium-999', 'chromium-1208', 'chromium-1237', 'ffmpeg-1011', 'b'],
      '/h/.cache/ms-playwright/chromium-999': ['chrome-linux'],
      '/h/.cache/ms-playwright/chromium-1208': ['chrome-linux64'],
      '/h/.cache/ms-playwright/chromium-1237': ['chrome-linux'],
      '/h/.cache/puppeteer/chrome': ['linux-99.0.4844.51', 'linux-115.0.5790.98'],
      '/h/.cache/puppeteer/chrome/linux-99.0.4844.51': ['chrome-linux64'],
      '/h/.cache/puppeteer/chrome/linux-115.0.5790.98': ['chrome-linux64'],
    };
    const listDir = (dir: string) => dirs[dir] ?? [];
    expect(discoverCacheChromes({ home: '/h', listDir })).toEqual([
      '/h/.cache/ms-playwright/chromium-1237/chrome-linux/chrome',
      '/h/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      '/h/.cache/ms-playwright/chromium-999/chrome-linux/chrome',
      '/h/.cache/puppeteer/chrome/linux-115.0.5790.98/chrome-linux64/chrome',
      '/h/.cache/puppeteer/chrome/linux-99.0.4844.51/chrome-linux64/chrome',
    ]);
    // findChrome falls through the fixed candidates into the caches.
    const cached = '/h/.cache/ms-playwright/chromium-1237/chrome-linux/chrome';
    expect(findChrome({ env: {}, exists: (p: string) => p === cached, home: '/h', listDir })).toBe(cached);
  });
});

describe('CdpSession protocol handling', () => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor(public url: string) {
      FakeWebSocket.instances.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(data: string) {
      this.sent.push(data);
      const msg = JSON.parse(data);
      // Auto-acknowledge the enable calls issued by connect().
      if (String(msg.method).endsWith('.enable')) {
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: msg.id, result: {} }) }));
      }
    }
    close() {
      this.onclose?.();
    }
    reply(payload: object) {
      this.onmessage?.({ data: JSON.stringify(payload) });
    }
  }

  async function connected() {
    const session = new CdpSession('ws://fake', { WebSocketImpl: FakeWebSocket as never });
    await session.connect();
    const ws = FakeWebSocket.instances.at(-1) as FakeWebSocket;
    return { session, ws };
  }

  it('correlates responses to requests and surfaces CDP errors as rejections', async () => {
    const { session, ws } = await connected();
    const pending = session.send('Page.navigate', { url: 'http://x/' });
    const sent = JSON.parse(ws.sent.at(-1) as string);
    expect(sent.method).toBe('Page.navigate');
    ws.reply({ id: sent.id, result: { frameId: 'f' } });
    await expect(pending).resolves.toEqual({ frameId: 'f' });

    const failing = session.send('Page.navigate');
    const failId = JSON.parse(ws.sent.at(-1) as string).id;
    ws.reply({ id: failId, error: { code: -32000, message: 'nope' } });
    await expect(failing).rejects.toThrow('CDP -32000: nope');
  });

  it('returns page exceptions as data, not runner crashes', async () => {
    const { session, ws } = await connected();
    const pending = session.evaluate('window.__frontxDesignDefects()', { awaitPromise: true });
    const id = JSON.parse(ws.sent.at(-1) as string).id;
    ws.reply({
      id,
      result: {
        result: { type: 'object' },
        exceptionDetails: { text: 'Uncaught', exception: { description: 'TypeError: not a function' } },
      },
    });
    await expect(pending).resolves.toEqual({ error: 'TypeError: not a function' });
  });

  it('rejects in-flight commands when the socket closes or the session is closed', async () => {
    const { session, ws } = await connected();
    const navigating = session.navigate('http://x/');
    const evaluating = session.evaluate('1 + 1');
    ws.onclose?.();
    await expect(navigating).rejects.toThrow(/CDP WebSocket closed/);
    await expect(evaluating).rejects.toThrow(/CDP WebSocket closed/);
    expect(session.pending.size).toBe(0);

    const second = await connected();
    const shot = second.session.screenshot();
    second.session.close();
    await expect(shot).rejects.toThrow(/session closed/);

    const third = await connected();
    const failing = third.session.send('Page.navigate');
    third.ws.onerror?.();
    await expect(failing).rejects.toThrow(/CDP WebSocket error/);
  });

  it('tears the session down when a command gets no reply within the deadline', async () => {
    const session = new CdpSession('ws://fake', {
      WebSocketImpl: FakeWebSocket as never,
      commandTimeoutMs: 30,
    });
    await session.connect();
    const stalled = session.navigate('http://x/');
    const bystander = session.evaluate('1 + 1');
    await expect(stalled).rejects.toThrow(/Page\.navigate got no reply within 30ms/);
    await expect(bystander).rejects.toThrow(/no reply within 30ms/);
    expect(session.pending.size).toBe(0);
  });

  it('collects console lines and waitForConsoleLine matches only from the given index', async () => {
    const { session, ws } = await connected();
    ws.reply({
      method: 'Runtime.consoleAPICalled',
      params: { type: 'log', args: [{ value: '[design-defects] clean: no objective design defects detected' }] },
    });
    ws.reply({ method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'boom' } } });
    expect(session.consoleLines).toEqual([
      'log: [design-defects] clean: no objective design defects detected',
      'log.error: boom',
    ]);
    await expect(
      session.waitForConsoleLine(/\[design-defects\]/, 0, 50),
    ).resolves.toContain('[design-defects] clean');
    await expect(session.waitForConsoleLine(/\[design-defects\]/, 1, 50)).resolves.toBeUndefined();
  });
});

// Both runners gate through gate.mjs, so one baseline case reads the same in
// each: a finding that came back twice, one that is gone where the run looked
// again, one that is gone where it did not, and one that is new.
describe('baseline diff shared by both runners', () => {
  it('classifies the same new, carried, resolved and unverified findings the same way', () => {
    type Found = Array<[string, string]>;
    const render = (findings: Found, places: string[]) => ({
      states: places.map((route) => ({
        route,
        theme: 'light',
        width: 1440,
        findings: findings.filter(([where]) => where === route).map(([, id]) => ({ id, target: 'main' })),
      })),
    });
    const source = (findings: Found, files: string[]) => ({
      files,
      findings: findings.map(([file, found]) => ({ file, gate: 'SYS-002', kind: 'color', found })),
    });
    const before: Found = [['/a', 'x'], ['/b', 'y'], ['/c', 'z']];
    const after: Found = [['/a', 'x'], ['/a', 'x'], ['/a', 'w']];
    type Counted = Array<{ count: number }>;
    const shape = (diff: { new: Counted; resolved: Counted; unverified: Counted; carriedOver: number }) => ({
      new: diff.new.map((e) => e.count),
      resolved: diff.resolved.map((e) => e.count),
      unverified: diff.unverified.map((e) => e.count),
      carriedOver: diff.carriedOver,
    });

    // /c is not looked at again: no state swept, no file checked.
    const renderDiff = diffReports(render(before, ['/a', '/b', '/c']), render(after, ['/a', '/b']));
    const staticDiff = diffStatic(source(before, ['/a', '/b', '/c']), source(after, ['/a', '/b']));
    expect(shape(renderDiff)).toEqual({ new: [1, 1], resolved: [1], unverified: [1], carriedOver: 1 });
    expect(shape(staticDiff)).toEqual(shape(renderDiff));
    expect(renderDiff.resolved[0]).toMatchObject({ route: '/b', id: 'y' });
    expect(staticDiff.resolved[0]).toMatchObject({ file: '/b', found: 'y' });

    // A partial report: both exit codes read its summary only.
    const renderReport = { summary: { environmentFailures: 0, screenshotFailures: 0, totalFindings: 3 } } as never;
    const staticReport = { summary: { parseErrors: 0, totalFindings: 3 } } as never;
    for (const config of [{ failOnFindings: true }, { failOnFindings: false }]) {
      for (const diff of [undefined, renderDiff, { ...renderDiff, new: [] }] as never[]) {
        expect(staticExitCode(staticReport, config, diff)).toBe(exitCode(renderReport, config, diff));
      }
    }
    expect(exitCode(renderReport, { failOnFindings: true }, renderDiff)).toBe(1);
    expect(exitCode(renderReport, { failOnFindings: true }, { ...renderDiff, new: [] })).toBe(0);
  });
});
