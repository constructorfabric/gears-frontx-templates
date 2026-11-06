// @vitest-environment node
// The DESIGN.md contrast mode's pure part: which pairs it measures, the
// WCAG arithmetic, and how one theme's probe result becomes a runner state.
// The probe itself runs in the browser (like the rest of the CLI, exercised
// against a real app, not here).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  contrastPairs,
  contrastRatio,
  contrastState,
  ContrastInputError,
  probeExpression,
  relativeLuminance,
  threshold,
} from '../runner/contrast.mjs';
import { parseArgs, resolvePaths } from '../runner/config.mjs';
import { buildReport, diffReports, exitCode, gateLookup, summaryLines } from '../runner/report.mjs';
import { designMdParser, readSkillJson } from '../runner/skill.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const renderCheck = readSkillJson('rules/render-check.json');
const spec = renderCheck.designMdContrast;
const gateFor = gateLookup(renderCheck);

async function shippedFront() {
  const { readDesignMd } = await designMdParser();
  return readDesignMd(path.resolve(here, '../../../../DESIGN.md')).front;
}

describe('contrastPairs', () => {
  it('takes every components entry with a text and a background colour, resolved to custom properties', async () => {
    const pairs = contrastPairs(await shippedFront(), spec);
    const names = pairs.map((p) => p.component);
    expect(names).toContain('badge-warning');
    expect(names).toContain('tooltip');
    // Background only, or text only: nothing to pair.
    expect(names).not.toContain('dialog-overlay');
    expect(names).not.toContain('button-link');
    expect(pairs.find((p) => p.component === 'badge-warning')).toEqual({
      component: 'badge-warning',
      text: { ref: '{colors.warning}', name: '--warning' },
      background: { ref: '{colors.warning-soft}', name: '--warning-soft' },
    });
    expect(pairs.find((p) => p.component === 'button-primary')?.font).toEqual({
      ref: '{typography.label}',
      size: '--text-label-size',
      weight: '--text-label-weight',
    });
  });

  it('refuses a pair that resolves to no custom property', () => {
    const front = { colors: { fg: 'var(--fg)', bad: '#fff' }, typography: {}, components: {} };
    const pair = (entry: object) => contrastPairs({ ...front, components: { x: entry } }, spec);
    expect(pair({ textColor: '{colors.fg}', backgroundColor: 'var(--bg)' })).toHaveLength(1);
    expect(() => pair({ textColor: '{colors.nope}', backgroundColor: 'var(--bg)' })).toThrow(ContrastInputError);
    expect(() => pair({ textColor: '{colors.bad}', backgroundColor: 'var(--bg)' })).toThrow(/resolves to no var\(--name\)/);
    expect(() => pair({ textColor: '{colors.fg}', backgroundColor: 'var(--bg)', typography: '{typography.none}' })).toThrow(
      /names no type role/,
    );
  });
});

describe('WCAG arithmetic', () => {
  it('computes luminance and ratio on known values', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 6);
    // #767676 on white is the classic 4.54:1; #777777 just misses (4.48:1).
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrastRatio([0x77, 0x77, 0x77], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it('uses the large-text threshold from 24 px, or from 18.66 px at weight 700', () => {
    expect(threshold(spec, 16, 400)).toEqual({ large: false, min: 4.5 });
    expect(threshold(spec, 24, 400)).toEqual({ large: true, min: 3 });
    expect(threshold(spec, 18.66, 700)).toEqual({ large: true, min: 3 });
    expect(threshold(spec, 18.66, 600)).toEqual({ large: false, min: 4.5 });
  });
});

describe('contrastState', () => {
  const pairs = [
    { component: 'card', text: { ref: '{colors.card-foreground}', name: '--card-foreground' }, background: { ref: '{colors.card}', name: '--card' } },
    { component: 'badge-warning', text: { ref: '{colors.warning}', name: '--warning' }, background: { ref: '{colors.warning-soft}', name: '--warning-soft' } },
    { component: 'heading', text: { ref: '{colors.muted-foreground}', name: '--muted-foreground' }, background: { ref: '{colors.card}', name: '--card' } },
    { component: 'chip', text: { ref: '{colors.x}', name: '--x' }, background: { ref: '{colors.card}', name: '--card' } },
  ];
  const result = (over: object) => ({
    component: 'c', text: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)',
    textRgb: [0, 0, 0], backgroundRgb: [255, 255, 255], fontSizePx: 14, fontWeight: 400, empty: [], ...over,
  });
  const probe = {
    value: {
      appliedTheme: 'light',
      results: [
        result({}),
        // 2.32:1.
        result({ textRgb: [170, 170, 170], text: 'rgb(170, 170, 170)' }),
        // 3.5:1 passes as large text only.
        result({ textRgb: [0x88, 0x88, 0x88], fontSizePx: 24 }),
        result({ empty: ['--x'] }),
      ],
    },
  };

  it('lists every measured pair, reports the ones below threshold and the unpaintable ones for review', () => {
    const state = contrastState({ theme: 'light', width: 1440, pairs, probe, spec, gateFor }) as Required<
      ReturnType<typeof contrastState>
    >;
    expect(state).toMatchObject({ check: 'design-md-contrast', route: 'DESIGN.md', theme: 'light', appliedTheme: 'light' });
    expect(state.contrast.map((c: { component: string; ratio: number; threshold: number }) => [c.component, c.threshold])).toEqual([
      ['card', 4.5],
      ['badge-warning', 4.5],
      ['heading', 3],
    ]);
    expect(state.contrast[0].ratio).toBe(21);
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0]).toMatchObject({ id: 'design-md-contrast', gate: 'COL-001', target: 'components.badge-warning' });
    expect(state.findings[0].detail).toMatch(
      /^\{colors\.warning\} \(--warning, rgb\(170, 170, 170\)\) on \{colors\.warning-soft\} \(--warning-soft, rgb\(255, 255, 255\)\): 2\.32:1, needs 4\.5:1 for normal text$/,
    );
    expect(state.needsReview).toEqual([
      expect.objectContaining({ gate: 'COL-001', kind: 'needs-review', target: 'components.chip', detail: '{colors.x} on {colors.card}: --x not set in this theme' }),
    ]);

    const report = buildReport({ baseUrl: 'u', themeKey: 'k' }, [state]);
    expect(report.summary).toMatchObject({ totalFindings: 1, needsReview: 1, byGate: { 'COL-001': 1 } });
    expect(summaryLines(report).join('\n')).toContain('CONTRAST light: COL-001 components.badge-warning {colors.warning}');
    expect(exitCode(report, { failOnFindings: true })).toBe(1);
    // A sweep state with the same render state is another identity.
    const sweep = { route: 'DESIGN.md', theme: 'light', width: 1440, findings: [state.findings[0]] };
    expect(diffReports(buildReport({ baseUrl: 'u', themeKey: 'k' }, [sweep]), report).new).toHaveLength(1);
  });

  it('turns a failed probe into an environment failure (exit 2)', () => {
    const failed = contrastState({ theme: 'dark', width: 1440, pairs, probe: { error: 'TypeError: x' }, spec, gateFor });
    expect(failed.environmentError).toBe('contrast probe failed: TypeError: x');
    const short = contrastState({ theme: 'dark', width: 1440, pairs, probe: { value: { results: [] } }, spec, gateFor });
    expect(short.environmentError).toMatch(/no result per pair/);
    expect(exitCode(buildReport({ baseUrl: 'u', themeKey: 'k' }, [failed]), { failOnFindings: false })).toBe(2);
  });
});

describe('the probe and the flag', () => {
  it('serialises a self-contained probe with the pair names', () => {
    const expression = probeExpression([
      { component: 'card', text: { ref: 'a', name: '--card-foreground' }, background: { ref: 'b', name: '--card' }, font: { ref: 'f', size: '--text-label-size', weight: '--text-label-weight' } },
    ]);
    expect(() => new Function(`return ${expression}`)).not.toThrow();
    expect(expression).toContain('"text":"--card-foreground","background":"--card","font":{"size":"--text-label-size"');
  });

  it('parses --design-md and resolves it against the project root', () => {
    const { config, errors } = parseArgs(['--design-md', 'DESIGN.md']);
    expect(errors).toEqual([]);
    expect(resolvePaths(config, '/app').designMd).toBe('/app/DESIGN.md');
  });
});
