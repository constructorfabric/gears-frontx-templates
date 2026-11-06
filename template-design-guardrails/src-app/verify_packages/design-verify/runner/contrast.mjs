/**
 * DESIGN.md contrast for the render runner (`--design-md <path>`).
 *
 * DESIGN.md names tokens and never holds values, so a pair's contrast exists
 * only in the rendered app. The pure part here reads the pairs out of the
 * front matter (parsed by the skill's own check-design-md parser) and does
 * the WCAG arithmetic; `probeInPage` runs in the browser, once per theme: one
 * probe element per pair painted with the pair's custom properties, its
 * computed colours composited to sRGB on a 1x1 canvas over the page
 * background, so alpha and every colour space the browser knows come out as
 * plain RGB without parsing any CSS here. Pair roles, thresholds and the rule
 * id are data in the skill's rules/render-check.json (`designMdContrast`).
 */
/* global document, getComputedStyle */

const VAR_ONLY = /^var\((--[\w-]+)\)$/;
const REF_ONLY = /^\{([^{}.]+)\.([^{}]+)\}$/;

/** A DESIGN.md pair that names no resolvable token: exit 2. */
export class ContrastInputError extends Error {}

/**
 * @param {Record<string, any>} front
 * @param {string} value a `{group.key}` reference or one `var(--name)`
 * @param {string} at where the value sits, for the message
 * @returns {string} the custom property name
 */
function resolveName(front, value, at) {
  const ref = REF_ONLY.exec(value);
  const target = ref ? front[ref[1]]?.[ref[2]] : value;
  const name = typeof target === 'string' ? VAR_ONLY.exec(target)?.[1] : undefined;
  if (!name) {
    throw new ContrastInputError(
      `DESIGN.md ${at}: ${JSON.stringify(value)} resolves to no var(--name); run the skill's scripts/check-design-md.mjs`,
    );
  }
  return name;
}

/**
 * @typedef {{component: string,
 *   text: {ref: string, name: string}, background: {ref: string, name: string},
 *   font?: {ref: string, size: string, weight: string}}} ContrastPair
 */

/**
 * Every `components` entry that names both colour roles of a pair in the
 * data, resolved to custom property names, with the entry's type role when
 * it has one (large text has a lower threshold).
 *
 * @param {Record<string, any>} front parsed DESIGN.md front matter
 * @param {{pairs: Array<{text: string, background: string}>, typography: string}} spec
 * @returns {ContrastPair[]}
 */
export function contrastPairs(front, spec) {
  const pairs = [];
  for (const [component, entry] of Object.entries(front.components ?? {})) {
    for (const pair of spec.pairs) {
      const text = entry[pair.text];
      const background = entry[pair.background];
      if (text === undefined || background === undefined) continue;
      const at = `components.${component}`;
      /** @type {ContrastPair} */
      const found = {
        component,
        text: { ref: text, name: resolveName(front, text, `${at}.${pair.text}`) },
        background: { ref: background, name: resolveName(front, background, `${at}.${pair.background}`) },
      };
      const role = entry[spec.typography];
      if (role !== undefined) {
        const ref = REF_ONLY.exec(role);
        const values = ref ? front[ref[1]]?.[ref[2]] : undefined;
        if (!values || typeof values !== 'object') {
          throw new ContrastInputError(`DESIGN.md ${at}.${spec.typography}: ${JSON.stringify(role)} names no type role`);
        }
        found.font = {
          ref: role,
          size: resolveName(front, values.fontSize, `${role} fontSize`),
          weight: resolveName(front, values.fontWeight, `${role} fontWeight`),
        };
      }
      pairs.push(found);
    }
  }
  return pairs;
}

/** WCAG relative luminance of an 8-bit sRGB colour. @param {number[]} rgb */
export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. @param {number[]} a @param {number[]} b */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The threshold for text of this computed size and weight: large text (at
 * least the data's minPx, or boldMinPx at boldWeight and above) has the lower
 * one.
 *
 * @param {{thresholds: {text: number, largeText: number}, largeText: {minPx: number, boldMinPx: number, boldWeight: number}}} spec
 * @param {number} fontSizePx
 * @param {number} fontWeight
 */
export function threshold(spec, fontSizePx, fontWeight) {
  const { minPx, boldMinPx, boldWeight } = spec.largeText;
  const large = fontSizePx >= minPx || (fontSizePx >= boldMinPx && fontWeight >= boldWeight);
  return { large, min: large ? spec.thresholds.largeText : spec.thresholds.text };
}

/**
 * Runs in the page (serialised by probeExpression): paints one probe per pair
 * and returns computed and composited colours. Self-contained on purpose.
 *
 * @param {Array<{component: string, text: string, background: string, font?: {size: string, weight: string}}>} specs
 */
export function probeInPage(specs) {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { error: 'the page gives no 2d canvas context' };
  // fillStyle keeps its old value when a colour does not parse; two
  // different sentinels tell that apart from a colour equal to one of them.
  const accepts = (color) =>
    ['#010203', '#030201'].some((sentinel) => {
      ctx.fillStyle = sentinel;
      ctx.fillStyle = color;
      return ctx.fillStyle !== sentinel;
    });
  const paint = (colors) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const color of colors) {
      if (!accepts(color)) return null;
      ctx.fillRect(0, 0, 1, 1);
    }
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const backdrop = ['#ffffff', rootStyle.backgroundColor, getComputedStyle(document.body).backgroundColor];
  const host = document.createElement('div');
  host.setAttribute('data-design-md-probe', '');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;';
  document.body.appendChild(host);
  try {
    const results = specs.map((spec) => {
      const names = [spec.text, spec.background, ...(spec.font ? [spec.font.size, spec.font.weight] : [])];
      const el = document.createElement('span');
      el.textContent = 'Aa';
      el.style.backgroundColor = `var(${spec.background})`;
      el.style.color = `var(${spec.text})`;
      if (spec.font) {
        el.style.fontSize = `var(${spec.font.size})`;
        el.style.fontWeight = `var(${spec.font.weight})`;
      }
      host.appendChild(el);
      const style = getComputedStyle(el);
      const backgroundRgb = paint([...backdrop, style.backgroundColor]);
      return {
        component: spec.component,
        background: style.backgroundColor,
        text: style.color,
        backgroundRgb,
        textRgb: backgroundRgb && paint([...backdrop, style.backgroundColor, style.color]),
        fontSizePx: Number.parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight) || 400,
        empty: names.filter((name) => rootStyle.getPropertyValue(name).trim() === ''),
      };
    });
    return { appliedTheme: root.getAttribute('data-theme'), results };
  } finally {
    host.remove();
  }
}

/** @param {ContrastPair[]} pairs */
export function probeExpression(pairs) {
  const specs = pairs.map((p) => ({
    component: p.component,
    text: p.text.name,
    background: p.background.name,
    ...(p.font ? { font: { size: p.font.size, weight: p.font.weight } } : {}),
  }));
  return `(${probeInPage.toString()})(${JSON.stringify(specs)})`;
}

// WCAG forbids rounding a ratio up to pass, so the shown value is cut, not rounded.
const fixed = (n) => Math.floor(n * 100) / 100;

/**
 * Turns one theme's probe result into a runner state: every pair measured
 * under `contrast`, the pairs below their threshold as findings, and the
 * pairs the page could not paint as needs-review entries.
 *
 * @param {{theme: string, width: number, pairs: ContrastPair[],
 *   probe: {value?: any, error?: string}, spec: {ruleId: string} & Parameters<typeof threshold>[0],
 *   gateFor: (id: string) => string}} input
 * @returns {{check: string, route: string, theme: string, width: number,
 *   environmentError?: string, appliedTheme?: string | null, contrast?: any[],
 *   findings?: any[], needsReview?: any[]}}
 */
export function contrastState({ theme, width, pairs, probe, spec, gateFor }) {
  const state = { check: 'design-md-contrast', route: 'DESIGN.md', theme, width };
  if (probe.error !== undefined || probe.value?.error) {
    return { ...state, environmentError: `contrast probe failed: ${probe.error ?? probe.value.error}` };
  }
  const { appliedTheme, results } = probe.value ?? {};
  if (!Array.isArray(results) || results.length !== pairs.length) {
    return { ...state, environmentError: `contrast probe returned no result per pair: ${JSON.stringify(probe.value)}` };
  }
  const gate = gateFor(spec.ruleId);
  const contrast = [];
  const findings = [];
  const needsReview = [];
  pairs.forEach((pair, i) => {
    const r = results[i];
    const target = `components.${pair.component}`;
    const names = `${pair.text.ref} on ${pair.background.ref}`;
    if (r.empty.length > 0 || !r.textRgb || !r.backgroundRgb) {
      const why = r.empty.length > 0 ? `${r.empty.join(', ')} not set in this theme` : 'the page could not paint the colours';
      needsReview.push({ id: spec.ruleId, gate, kind: 'needs-review', target, detail: `${names}: ${why}` });
      return;
    }
    const ratio = contrastRatio(r.textRgb, r.backgroundRgb);
    const { large, min } = threshold(spec, r.fontSizePx, r.fontWeight);
    contrast.push({
      component: pair.component,
      text: { ref: pair.text.ref, name: pair.text.name, computed: r.text, rgb: r.textRgb },
      background: { ref: pair.background.ref, name: pair.background.name, computed: r.background, rgb: r.backgroundRgb },
      fontSizePx: r.fontSizePx,
      fontWeight: r.fontWeight,
      ratio: fixed(ratio),
      threshold: min,
      large,
    });
    if (ratio < min) {
      findings.push({
        id: spec.ruleId,
        gate,
        target,
        detail:
          `${pair.text.ref} (${pair.text.name}, ${r.text}) on ${pair.background.ref} (${pair.background.name}, ${r.background}): ` +
          `${fixed(ratio).toFixed(2)}:1, needs ${min}:1 for ${large ? 'large' : 'normal'} text`,
      });
    }
  });
  return { ...state, appliedTheme, contrast, findings, needsReview };
}
