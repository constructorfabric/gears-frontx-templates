/**
 * Whole-skill check for the design-guardrails bundle's one skill,
 * `skills/frontx-design/`. The SKILL.md map is the index of the skill (it
 * replaced the generated guideline index), so this test keeps it honest: the
 * rule registry has a valid shape, every gate id the prose cites exists, the
 * map names exactly the files on disk, and the bundle declares one skill
 * whose map stays short enough to load.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = path.join(here, '..');
const bundle = path.join(template, '.frontx/ai/@gears-frontx/template-design-guardrails');
const skill = path.join(bundle, 'skills/frontx-design');
const SKILL_DIRS = ['references', 'rules', 'templates', 'scripts'];

const readText = (file) => readFileSync(file, 'utf8');
const readJson = (rel) => JSON.parse(readText(path.join(skill, rel)));
// Deliberate guard: subfolders are not collected, so the skill stays flat and the SKILL.md map lists every file.
const filesIn = (dir) =>
  readdirSync(path.join(skill, dir))
    .filter((name) => statSync(path.join(skill, dir, name)).isFile())
    .map((name) => `${dir}/${name}`);
const skillFiles = SKILL_DIRS.flatMap(filesIn);
const skillMd = readText(path.join(skill, 'SKILL.md'));

// Gate ids look like SYS-001 or A11Y-003.
const GATE_ID = /\b[A-Z][A-Z0-9]{1,4}-\d{3}\b/g;
// A path into the skill, as the markdown writes it.
const SKILL_PATH = /\b(?:references|rules|templates|scripts)\/[\w.-]+\.(?:md|json|mjs)\b/g;

describe('rules/quality-gates.json', () => {
  const registry = readJson('rules/quality-gates.json');
  const waivers = Object.keys(registry.waiver);

  it('declares exactly the never, with-reason and finish waiver levels', () => {
    expect([...waivers].sort()).toEqual(['finish', 'never', 'with-reason']);
  });

  it('gives every gate a unique id, a known severity and a known waiver level', () => {
    const ids = registry.gates.map((g) => g.id);
    // A missing id would pass the uniqueness check below (undefined is unique).
    expect(ids.filter((id) => typeof id !== 'string' || !/^[A-Z][A-Z0-9]{1,4}-\d{3}$/.test(id))).toEqual([]);
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
    expect([...readJson('rules/review-rubric.json').blockerRuleIds].sort()).toEqual(blockers.sort());
  });
});

describe('rules/static-check.json', () => {
  const rules = readJson('rules/static-check.json');
  const gates = new Map(readJson('rules/quality-gates.json').gates.map((g) => [g.id, g]));

  it('names gates the registry holds', () => {
    expect(gates.get(rules.elements.gate)?.rule).toMatch(/UI-kit components/);
    expect(gates.get(rules.literals.gate)?.rule).toMatch(/semantic tokens/);
  });

  it('keys native tags and roles in lowercase and names components in PascalCase', () => {
    const { tags, inputTypes, roles, anchorAsButton } = rules.elements;
    for (const key of [...Object.keys(tags), ...Object.keys(inputTypes), ...Object.keys(roles)]) {
      expect(key).toMatch(/^[a-z]+$/);
    }
    const names = [...Object.values(tags), ...Object.values(inputTypes), ...Object.values(roles), anchorAsButton].flat();
    expect(names.filter((name) => !/^[A-Z][A-Za-z]+$/.test(name))).toEqual([]);
  });

  // The installed kit's export names are checked by design-verify's own suite,
  // which runs with the kit installed.
  it('gives every literal kind a DESIGN.md group that names at least one token for it', async () => {
    const { readDesignMd } = await import(path.join(skill, 'scripts/check-design-md.mjs'));
    const { front } = readDesignMd(path.join(template, 'DESIGN.md'));
    for (const [kind, spec] of Object.entries(rules.literals.kinds)) {
      const pattern = new RegExp(spec.keyPattern ?? '');
      const tokens = Object.entries(front[spec.group] ?? {})
        .filter(([key]) => pattern.test(key))
        .map(([, value]) => (spec.field ? value[spec.field] : value));
      expect(tokens.length, kind).toBeGreaterThan(0);
      expect(tokens.filter((t) => !/^var\(--[\w-]+\)$/.test(t)), kind).toEqual([]);
    }
  });
});

describe('rules/render-check.json', () => {
  const data = readJson('rules/render-check.json');
  const gates = new Set(readJson('rules/quality-gates.json').gates.map((g) => g.id));

  it('maps each checker rule id once, to a gate the registry holds', () => {
    const ids = data.ruleGates.flatMap((row) => row.rules);
    expect(ids.length).toBeGreaterThan(40);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.ruleGates.filter((row) => !gates.has(row.gate))).toEqual([]);
    expect(data.ruleGates.filter((row) => !row.note)).toEqual([]);
  });

  it('reports unmapped ids under a gate name no registry gate has', () => {
    expect(gates.has(data.unmappedGate)).toBe(false);
  });
});

describe('rules/design-contract.json', () => {
  it('ranks the project DESIGN.md right after the installed kit documentation in sourcePrecedence', () => {
    const order = readJson('rules/design-contract.json').sourcePrecedence;
    const design = order.findIndex((source) => source.includes('DESIGN.md'));
    expect(design).toBeGreaterThan(-1);
    expect(order[design - 1]).toMatch(/UI-kit documentation/);
    expect(order[design + 1]).toMatch(/Rule files/);
  });
});

describe('gate ids cited in prose', () => {
  const known = new Set(readJson('rules/quality-gates.json').gates.map((g) => g.id));
  const prose = [
    ['SKILL.md', skillMd],
    ['DESIGN.md', readText(path.join(template, 'DESIGN.md'))],
    ...skillFiles.filter((f) => f.endsWith('.md')).map((f) => [f, readText(path.join(skill, f))]),
  ];

  it('finds gate ids to check', () => {
    expect(prose.some(([, text]) => (text.match(GATE_ID) ?? []).length > 0)).toBe(true);
  });

  it.each(prose)('%s cites only gates the registry defines', (_name, text) => {
    const unknown = [...new Set(text.match(GATE_ID) ?? [])].filter((id) => !known.has(id));
    expect(unknown).toEqual([]);
  });
});

describe('the SKILL.md map', () => {
  const named = new Set(skillMd.match(SKILL_PATH) ?? []);

  it('names only files that exist', () => {
    expect([...named].filter((rel) => !existsSync(path.join(skill, rel)))).toEqual([]);
  });

  it('names every file under references/, rules/, templates/ and scripts/', () => {
    expect(skillFiles.length).toBeGreaterThan(0);
    expect(skillFiles.filter((rel) => !named.has(rel))).toEqual([]);
  });

  it('points only at skill files that exist from any skill markdown', () => {
    const missing = skillFiles
      .filter((f) => f.endsWith('.md'))
      .flatMap((f) => (readText(path.join(skill, f)).match(SKILL_PATH) ?? []).map((rel) => [f, rel]))
      .filter(([, rel]) => !existsSync(path.join(skill, rel)));
    expect(missing).toEqual([]);
  });

  it('names the outside files that exist: DESIGN.md and the design-verify package', () => {
    for (const rel of ['DESIGN.md', 'src-app/verify_packages/design-verify/']) {
      expect(skillMd).toContain(`\`${rel}\``);
      expect(existsSync(path.join(template, rel))).toBe(true);
    }
  });
});

describe('paths other templates cite into the skill', () => {
  // Other templates name a skill file in full (`skills/frontx-design/references/generate.md`) or, in a
  // paragraph that names the `frontx-design` skill, relative to it ("that skill's `references/generate.md`").
  const repo = path.join(template, '..');
  const FULL_PATH = /skills\/frontx-design\/((?:[\w.-]+\/)*[\w.-]+\.\w+)/g;
  const cited = (text) =>
    text.split(/\n[ \t]*\n/).flatMap((paragraph) => [
      ...[...paragraph.matchAll(FULL_PATH)].map((m) => m[1]),
      ...(paragraph.includes('frontx-design') ? (paragraph.match(SKILL_PATH) ?? []) : []),
      ...(paragraph.includes('frontx-design') ? (paragraph.match(/\bSKILL\.md\b/g) ?? []) : []),
    ]);
  const citations = readdirSync(repo)
    .filter((name) => name.startsWith('template-') && name !== path.basename(template))
    .map((name) => path.join(repo, name, '.frontx/ai'))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir, { recursive: true })
        .filter((rel) => rel.endsWith('.md'))
        .map((rel) => path.join(dir, rel)),
    )
    .flatMap((file) => [...new Set(cited(readText(file)))].map((rel) => [path.relative(repo, file), rel]));

  it('finds the citations other templates make today', () => {
    expect(citations).toContainEqual([
      'template-mfe/.frontx/ai/@gears-frontx/frontx-template-mfe/skills/add-mfe-package/SKILL.md',
      'references/generate.md',
    ]);
  });

  it.each(citations)('%s cites %s, which the skill holds', (_file, rel) => {
    expect(existsSync(path.join(skill, rel))).toBe(true);
  });
});

describe('the bundle declares one compact skill', () => {
  const extension = JSON.parse(readText(path.join(bundle, 'extension.json')));

  it('has exactly one extension entry, pointing at a dir with SKILL.md', () => {
    expect(extension.entries).toHaveLength(1);
    const [entry] = extension.entries;
    expect(entry.category).toBe('skills');
    expect(existsSync(path.join(bundle, entry.path, 'SKILL.md'))).toBe(true);
  });

  it('keeps only skills/ at the bundle root', () => {
    const dirs = readdirSync(bundle).filter((name) => statSync(path.join(bundle, name)).isDirectory());
    expect(dirs).toEqual(['skills']);
  });

  it('keeps SKILL.md to at most 80 lines and its description to at most 300 characters', () => {
    expect(skillMd.trimEnd().split('\n').length).toBeLessThanOrEqual(80);
    const description = skillMd.match(/^description: (.+)$/m)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(300);
  });
});
