/*
 * The series colours of every chart that colours by series, slice, tile or group: one place for all of them.
 *
 * - Ten hand-tuned colours per theme, in an order that keeps neighbours apart in hue and lightness for normal and
 *   colour-deficient vision, each at least 3:1 against the card surface of its theme (white in light, #0f172a in
 *   dark). A slot keeps its hue in both themes.
 * - Past ten, a generator: each next colour is the one of a fixed OKLCH grid (hue every 6 degrees, four lightness
 *   steps per theme, two chroma steps, only colours at 3:1 or more against the surface) farthest in OKLab from every
 *   colour before it. It is deterministic and never comes back to an earlier colour while the grid has an unused one.
 * - A host sets its own colours with the CSS custom properties `--dashboard-chart-1`, `--dashboard-chart-2` and so
 *   on, on any element around the dashboard: they inherit into the widgets' shadow roots. A series whose property
 *   the host does not set takes the template's colour of the same position, so a short host list continues with the
 *   template's sequence and never wraps to its own first colour.
 *
 * The colour is written as `light-dark(<light>, <dark>)`, which follows the `color-scheme` the kit sets on each
 * theme scope, so the chart code does not need to know the theme.
 */

export type Scheme = 'light' | 'dark';

/** The ten colours of each theme, slot by slot. */
export const SERIES_TEN: Readonly<Record<Scheme, readonly string[]>> = {
  light: ['#2563eb', '#e8721c', '#d53daf', '#ae9203', '#0398cd', '#5ea130', '#884c1e', '#0b9488', '#703dc6', '#da2751'],
  dark: ['#5193f4', '#dc7533', '#cc4da9', '#ab9017', '#27a1cd', '#50a33d', '#985521', '#099b8f', '#7e5acc', '#da4053'],
};

/** The chart surface of each theme: the kit's card colour. Every colour keeps 3:1 against it. */
export const SURFACE: Readonly<Record<Scheme, string>> = { light: '#ffffff', dark: '#0f172a' };

/** The lightness steps of the generator's grid in each theme, inside the band where 3:1 against the surface holds. */
const LIGHTNESS: Readonly<Record<Scheme, readonly number[]>> = { light: [0.46, 0.52, 0.58, 0.64], dark: [0.56, 0.62, 0.68, 0.74] };
const CHROMA = [0.09, 0.15];
const HUE_STEP = 6;

type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const linearOf = (hex: string) => [1, 3, 5].map((at) => toLinear(parseInt(hex.slice(at, at + 2), 16) / 255));
const hexOf = (linear: number[]) => `#${linear.map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255).toString(16).padStart(2, '0')).join('')}`;

/** A `#rrggbb` colour in OKLab. */
export function oklabOf(hex: string): Lab {
  const [r, g, b] = linearOf(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** The distance of two colours: OKLab Euclidean distance times 100 (about 2 is a just-noticeable difference). */
export function distance(a: string, b: string): number {
  return apart(oklabOf(a), oklabOf(b));
}

const apart = (p: Lab, q: Lab) => 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

const luminance = (hex: string) => {
  const [r, g, b] = linearOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** An OKLCH colour as `#rrggbb`, its chroma lowered until it fits sRGB. */
function hexOfOklch(lightness: number, chroma: number, hue: number): string {
  for (let c = chroma; c > 0; c -= 0.002) {
    const [a, b] = [c * Math.cos((hue * Math.PI) / 180), c * Math.sin((hue * Math.PI) / 180)];
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (linear.every((v) => v >= -1e-6 && v <= 1 + 1e-6)) return hexOf(linear);
  }
  return hexOfOklch(lightness, 0, hue);
}

/** The generated colours of a theme, in order, computed once: the grid by farthest-point picking after the ten. */
const generated: Partial<Record<Scheme, string[]>> = {};

function generatedOf(scheme: Scheme): string[] {
  const known = generated[scheme];
  if (known) return known;
  const grid = new Set<string>();
  for (let hue = 0; hue < 360; hue += HUE_STEP) {
    for (const lightness of LIGHTNESS[scheme]) {
      for (const chroma of CHROMA) {
        const hex = hexOfOklch(lightness, chroma, hue);
        if (contrast(hex, SURFACE[scheme]) >= 3) grid.add(hex);
      }
    }
  }
  const pool = [...grid].filter((hex) => !SERIES_TEN[scheme].includes(hex));
  const labs = pool.map(oklabOf);
  // The least distance of each grid colour to every colour picked so far; the farthest one is picked next.
  const nearest = labs.map((lab) => Math.min(...SERIES_TEN[scheme].map((taken) => apart(lab, oklabOf(taken)))));
  const order: string[] = [];
  const left = new Set(pool.keys());
  while (left.size > 0) {
    let pick = -1;
    for (const at of left) if (pick < 0 || nearest[at] > nearest[pick]) pick = at;
    left.delete(pick);
    order.push(pool[pick]);
    for (const at of left) nearest[at] = Math.min(nearest[at], apart(labs[at], labs[pick]));
  }
  generated[scheme] = order;
  return order;
}

/**
 * The template's colour of the series at a zero-based position in a theme: the ten, then the generator. Past the
 * last grid colour (several hundred series) the generated sequence starts again.
 */
export function seriesHex(position: number, scheme: Scheme): string {
  const ten = SERIES_TEN[scheme];
  if (position < ten.length) return ten[position];
  const more = generatedOf(scheme);
  return more[(position - ten.length) % more.length];
}

/** The CSS colour of the series at a zero-based position: the host's own when it sets one, else the template's. */
export function seriesColor(position: number): string {
  return `var(--dashboard-chart-${position + 1}, light-dark(${seriesHex(position, 'light')}, ${seriesHex(position, 'dark')}))`;
}
