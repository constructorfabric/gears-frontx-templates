/**
 * Whole-skill check for the design-guardrails bundle's one skill,
 * `skills/frontx-design/`. The SKILL.md map is the index of the skill (it
 * replaced the generated guideline index), so this test keeps it honest: the
 * rule registry has a valid shape, every gate id the prose cites exists, the
 * map names exactly the files on disk, and the bundle declares its two skills
 * whose maps stay short enough to load. The sibling skill
 * `skills/frontx-design-proposal/` gets the same map, path and gate checks
 * against its own files and the frontx-design registry, plus the checks that
 * keep its drawing kit and page skeleton in step.
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
const SKILL_PATH = /\b(?:references|rules|templates|scripts)\/[\w.-]+\.(?:md|json|mjs|ts|tsx|css)\b/g;

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
  // Entries are found by their stable ids, so rewording a source changes nothing here.
  it('ranks the project DESIGN.md below the installed kit documentation and above the rule files in sourcePrecedence', () => {
    const order = readJson('rules/design-contract.json').sourcePrecedence;
    const ids = order.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(order.filter((entry) => typeof entry.source !== 'string' || entry.source.trim() === '')).toEqual([]);
    const at = (id) => ids.indexOf(id);
    expect(at('design-md')).toBeGreaterThan(-1);
    expect(at('kit-docs')).toBeGreaterThan(-1);
    expect(at('skill-rules')).toBeGreaterThan(-1);
    expect(at('kit-docs')).toBeLessThan(at('design-md'));
    expect(at('design-md')).toBeLessThan(at('skill-rules'));
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

  it('reports a .ts, .tsx or .css skill file the map leaves out', () => {
    const missingFrom = (text) => {
      const names = new Set(text.match(SKILL_PATH) ?? []);
      return skillFiles.filter((rel) => !names.has(rel));
    };
    for (const rel of ['templates/iso.ts', 'templates/iso-scene.tsx', 'templates/iso.module.css']) {
      expect(missingFrom(skillMd.replaceAll(rel, 'PLACEHOLDER')), rel).toContain(rel);
    }
    // The extension list itself must cover .ts, .tsx and .css, or the two checks above go blind.
    for (const rel of ['templates/iso.ts', 'templates/iso-scene.tsx', 'templates/iso.module.css']) {
      expect(`see ${rel} here`.match(SKILL_PATH) ?? [], rel).toContain(rel);
    }
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

describe('the bundle declares two compact skills', () => {
  const extension = JSON.parse(readText(path.join(bundle, 'extension.json')));

  it('has exactly the frontx-design and frontx-design-proposal entries, each a dir with SKILL.md', () => {
    expect(extension.entries.map((entry) => entry.id)).toEqual(['frontx-design', 'frontx-design-proposal']);
    for (const entry of extension.entries) {
      expect(entry.category).toBe('skills');
      expect(entry.path).toBe(`skills/${entry.id}`);
      expect(existsSync(path.join(bundle, entry.path, 'SKILL.md'))).toBe(true);
    }
  });

  it('keeps only skills/ at the bundle root, and only the declared skills under it', () => {
    const dirs = readdirSync(bundle).filter((name) => statSync(path.join(bundle, name)).isDirectory());
    expect(dirs).toEqual(['skills']);
    expect(readdirSync(path.join(bundle, 'skills')).sort()).toEqual(extension.entries.map((entry) => entry.id).sort());
  });

  it.each(extension.entries.map((entry) => entry.id))('keeps the %s SKILL.md name matching and its description to at most 300 characters', (id) => {
    const text = readText(path.join(bundle, 'skills', id, 'SKILL.md'));
    expect(text.match(/^name: (.+)$/m)?.[1]).toBe(id);
    const description = text.match(/^description: (.+)$/m)?.[1] ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(300);
  });
});

describe('the frontx-design-proposal skill', () => {
  const proposal = path.join(bundle, 'skills/frontx-design-proposal');
  const proposalMd = readText(path.join(proposal, 'SKILL.md'));
  // templates/draw/ is the drawing kit's one subfolder; nothing else nests.
  const DIRS = ['references', 'templates', 'templates/draw', 'scripts'];
  const filesOf = (dir) =>
    readdirSync(path.join(proposal, dir))
      .filter((name) => statSync(path.join(proposal, dir, name)).isFile())
      .map((name) => `${dir}/${name}`);
  const ownFiles = DIRS.flatMap(filesOf);
  const assetFiles = readdirSync(path.join(proposal, 'assets'), { recursive: true })
    .map((rel) => `assets/${rel.split(path.sep).join('/')}`)
    .filter((rel) => statSync(path.join(proposal, rel)).isFile());
  // An own path is not preceded by a path segment, so `../frontx-design/references/x.md` is not one.
  const OWN_PATH = /(?<![\w./-])(?:references|templates|scripts)\/(?:draw\/)?[\w.-]+\.(?:md|json|mjs|ts|tsx|css|html)\b/g;
  const SIBLING_PATH = /\.\.\/frontx-design\/((?:references|rules|templates|scripts)\/[\w.-]+\.\w+)/g;
  const prose = [['SKILL.md', proposalMd], ...ownFiles.filter((f) => f.endsWith('.md')).map((f) => [f, readText(path.join(proposal, f))])];

  it('nests only templates/draw/, and keeps nothing beside references/, templates/, scripts/ and assets/ but SKILL.md', () => {
    for (const dir of ['references', 'scripts', 'templates/draw']) {
      expect(readdirSync(path.join(proposal, dir)).filter((name) => !statSync(path.join(proposal, dir, name)).isFile())).toEqual([]);
    }
    expect(readdirSync(path.join(proposal, 'templates')).filter((name) => !statSync(path.join(proposal, 'templates', name)).isFile())).toEqual(['draw']);
    expect(readdirSync(proposal).sort()).toEqual(['SKILL.md', 'assets', 'references', 'scripts', 'templates']);
  });

  it('names every file under references/, templates/ and scripts/ in its SKILL.md map, and only files that exist', () => {
    const named = new Set(proposalMd.match(OWN_PATH) ?? []);
    expect(ownFiles.filter((rel) => !named.has(rel))).toEqual([]);
    expect([...named].filter((rel) => !existsSync(path.join(proposal, rel)))).toEqual([]);
  });

  it('names the folder of every asset file in its SKILL.md map', () => {
    expect(assetFiles.length).toBeGreaterThan(0);
    const folders = [...proposalMd.matchAll(/`(assets\/[\w./-]+\/)`/g)].map((m) => m[1]);
    expect(assetFiles.filter((rel) => !folders.some((folder) => rel.startsWith(folder)))).toEqual([]);
  });

  it.each(prose)('%s points only at its own files and sibling files that exist', (_name, text) => {
    expect((text.match(OWN_PATH) ?? []).filter((rel) => !existsSync(path.join(proposal, rel)))).toEqual([]);
    const sibling = [...text.matchAll(SIBLING_PATH)].map((m) => m[1]);
    expect(sibling.filter((rel) => !existsSync(path.join(skill, rel)))).toEqual([]);
  });

  it.each(prose)('%s cites only gates the frontx-design registry defines', (_name, text) => {
    const known = new Set(readJson('rules/quality-gates.json').gates.map((g) => g.id));
    expect([...new Set(text.match(GATE_ID) ?? [])].filter((id) => !known.has(id))).toEqual([]);
  });

  it('keeps its SKILL.md at most 80 lines, and its fast path at most 250 lines', () => {
    expect(proposalMd.split('\n').length).toBeLessThanOrEqual(80);
    expect(readText(path.join(proposal, 'references/propose.md')).split('\n').length).toBeLessThanOrEqual(250);
  });

  it('is routed to from one row of the frontx-design task table', () => {
    const rows = skillMd.split('\n').filter((line) => line.startsWith('|') && line.includes('frontx-design-proposal'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('`../frontx-design-proposal/SKILL.md`');
  });

  it('draws every block from draw.css classes, and every draw.css class appears in a block and in the drawing-kit reference', () => {
    const css = readText(path.join(proposal, 'templates/draw/draw.css')).replace(/\/\*[\s\S]*?\*\//g, '');
    const defined = new Set([...css.matchAll(/\.(d-[\w-]+)/g)].map((m) => m[1]));
    const blocks = readText(path.join(proposal, 'templates/draw/blocks.html')).replace(/<!--[\s\S]*?-->/g, '');
    const used = new Set([...blocks.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
    expect([...used].filter((c) => !defined.has(c))).toEqual([]);
    expect([...defined].filter((c) => !used.has(c))).toEqual([]);
    const reference = readText(path.join(proposal, 'references/drawing-kit.md'));
    // A class is documented by its full name in a code span, or a modifier by its backticked suffix in the row of its block.
    const rows = reference.split('\n').filter((line) => line.startsWith('|'));
    const named = new Set([...reference.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1].split(/\s+/)));
    const documented = (c) => named.has(c) || (/^d-[\w]+--[\w-]+$/.test(c)
      && rows.some((row) => row.includes(`\`${c.replace(/^d-[\w]+(--[\w-]+)$/, '$1')}\``) && row.includes(`\`${c.replace(/--[\w-]+$/, '')}\``)));
    expect([...defined].filter((c) => !documented(c))).toEqual([]);
  });

  it('carries draw.css unchanged in the proposal.html skeleton', () => {
    const page = readText(path.join(proposal, 'templates/proposal.html'));
    const draw = page.match(/<style id="draw">\n([\s\S]*?)\n<\/style>/)?.[1];
    expect(draw).toBe(readText(path.join(proposal, 'templates/draw/draw.css')).trimEnd());
  });

  it('writes no long dash in any of its text files', () => {
    const texts = [['SKILL.md', proposalMd], ...[...ownFiles, ...assetFiles].map((f) => [f, readText(path.join(proposal, f))])];
    expect(texts.filter(([, text]) => /[\u2013\u2014]/.test(text)).map(([f]) => f)).toEqual([]);
  });
});
