/**
 * Shape check for the design-guardrails rule registry
 * (`reference-artifacts/quality-gates.json`): skills and the review rubric
 * cite gate ids and read `level` and `waiver` from it, so a gate without a
 * known waiver level, a duplicate id, or a rubric blocker that is not a
 * blocker gate would break those readers silently.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(
  here,
  '..',
  'template-design-guardrails/.frontx/ai/@gears-frontx/template-design-guardrails/reference-artifacts',
);
const read = (name) => JSON.parse(readFileSync(path.join(artifacts, name), 'utf8'));

describe('quality-gates.json', () => {
  const registry = read('quality-gates.json');
  const waivers = Object.keys(registry.waiver);

  it('declares exactly the never, with-reason and finish waiver levels', () => {
    expect(waivers.sort()).toEqual(['finish', 'never', 'with-reason']);
  });

  it('gives every gate a unique id, a known severity and a known waiver level', () => {
    const ids = registry.gates.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const gate of registry.gates) {
      expect(Object.keys(registry.severity)).toContain(gate.level);
      expect(waivers).toContain(gate.waiver);
      for (const field of ['rule', 'evidence', 'fix']) expect(gate[field]).toBeTruthy();
    }
  });

  it('never lets a blocker gate be waived', () => {
    const waivable = registry.gates.filter((g) => g.level === 'blocker' && g.waiver !== 'never');
    expect(waivable.map((g) => g.id)).toEqual([]);
  });

  it('matches the review rubric blocker list', () => {
    const blockers = registry.gates.filter((g) => g.level === 'blocker').map((g) => g.id);
    expect([...read('review-rubric.json').blockerRuleIds].sort()).toEqual(blockers.sort());
  });
});
