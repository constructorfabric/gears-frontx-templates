/**
 * Tests for the gate that stops an unparseable GTS identifier from reaching the
 * generated aggregate.
 *
 * The failure this covers is silent everywhere else: an id one dot-token short
 * of the grammar builds, type-checks and generates, and only the host's
 * bootstrap rejects it, as a console error behind an empty navigation menu. So
 * the cases here assert the build refusal and the text that names where to edit,
 * not the parser, which is GTS's own.
 *
 * `ManifestGenerator` takes its directories as arguments; the module-level
 * defaults resolve against the working directory at import time, which a test
 * cannot move afterwards.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Gts } from '@globaltypesystem/gts-ts';

import { ManifestGenerator } from '../scripts/generate-mfe-manifests';

const MFE_MANIFEST_PATH = 'dist/mfe-manifest.json';

const PACKAGE_NAME = 'billing-mfe';

// The type portions every fixture id is chained onto. They are contracts rather
// than borrowed sample data: an entry or extension is an instance of exactly
// these types, so a fixture cannot pick neutral values for them.
const MANIFEST_TYPE = 'gts.frontx.mfes.mfe.mf_manifest.v1';
const ENTRY_TYPE = 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1';
const EXTENSION_TYPE = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1';
const SCREEN_DOMAIN = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

const VALID_MANIFEST_ID = `${MANIFEST_TYPE}~fixture.billing.mfe.manifest.v1`;
const VALID_ENTRY_ID = `${ENTRY_TYPE}~fixture.billing.mfe.home.v1`;
const VALID_EXTENSION_ID = `${EXTENSION_TYPE}~fixture.billing.screens.home.v1`;

// Stands in for the output of a previous successful run. Its content is never
// read back - what the cases assert is that the file is gone, so any marker the
// generator would not itself produce serves.
const EARLIER_GOOD_AGGREGATE = '{ "earlier": "run" }';

// Four dot-tokens where GTS requires five: 'screens' is missing the namespace
// position, so the segment ends up one short. This is the exact shape that cost
// two scaffolding runs their debug time.
const FOUR_TOKEN_EXTENSION_ID = `${EXTENSION_TYPE}~fixture.billing.screens.v1`;

let workspace: string;
let mfePackagesDir: string;
let outputFile: string;

interface ManifestOverrides {
  manifestId?: string;
  entryId?: string;
  extensionId?: string;
  /** Writes the manifest with no `extensions` key at all, as an incomplete build would. */
  omitExtensions?: boolean;
  /** Writes the manifest with no `entries` key at all, as an incomplete build would. */
  omitEntries?: boolean;
  /** Writes both collections present but empty, which is what a contributing-nothing MFE emits. */
  emptyCollections?: boolean;
  labelDictionaries?: unknown;
}

/**
 * Writes one package's enriched build output, with the ids a case wants to bend.
 * Everything else is the shape the frontxMfGts plugin emits, so a refusal in a
 * case can only come from the id under test.
 */
function mfePackageWithIds(overrides: ManifestOverrides): void {
  const packagePath = join(mfePackagesDir, PACKAGE_NAME);
  mkdirSync(join(packagePath, 'dist'), { recursive: true });
  writeFileSync(join(packagePath, 'mfe.json'), '{ "extensions": [] }', 'utf-8');

  const manifestId = overrides.manifestId ?? VALID_MANIFEST_ID;

  writeFileSync(
    join(packagePath, MFE_MANIFEST_PATH),
    JSON.stringify({
      manifest: {
        id: manifestId,
        name: PACKAGE_NAME,
        remoteEntry: 'http://localhost:3010/assets/remoteEntry.js',
        metaData: {
          name: PACKAGE_NAME,
          type: 'app',
          buildInfo: { buildVersion: '0', buildName: PACKAGE_NAME },
          remoteEntry: { name: 'remoteEntry.js', path: 'assets', type: 'module' },
          globalName: PACKAGE_NAME,
          publicPath: 'http://localhost:3010/',
        },
        shared: [],
      },
      ...(overrides.labelDictionaries !== undefined && { labelDictionaries: overrides.labelDictionaries }),
      ...(overrides.omitEntries
        ? {}
        : {
            entries: overrides.emptyCollections
              ? []
              : [
                  {
                    id: overrides.entryId ?? VALID_ENTRY_ID,
                    requiredProperties: [],
                    actions: [],
                    domainActions: [],
                    manifest: manifestId,
                    exposedModule: './lifecycle',
                    exposeAssets: { js: { async: [], sync: [] }, css: { async: [], sync: [] } },
                  },
                ],
          }),
      ...(overrides.omitExtensions
        ? {}
        : {
            extensions: overrides.emptyCollections
              ? []
              : [
                  {
                    id: overrides.extensionId ?? VALID_EXTENSION_ID,
                    domain: SCREEN_DOMAIN,
                    entry: overrides.entryId ?? VALID_ENTRY_ID,
                  },
                ],
          }),
    }),
    'utf-8',
  );
}

function generate(): void {
  new ManifestGenerator(mfePackagesDir, outputFile, MFE_MANIFEST_PATH, null).run();
}

function writeDictionary(contents: unknown = {
  type: 'gts.frontx.i18n.dict.screen_labels.v1~',
  language: 'en',
  labels: [{ extension: VALID_EXTENSION_ID, label: 'Home' }],
}): void {
  const labelsDir = join(mfePackagesDir, PACKAGE_NAME, 'public', 'labels');
  mkdirSync(labelsDir, { recursive: true });
  writeFileSync(join(labelsDir, 'en.json'), typeof contents === 'string' ? contents : JSON.stringify(contents));
}

/**
 * The refusal message, so a case can read it rather than match a pattern
 * against it. A generator that wrote an aggregate instead fails here with what
 * it did, not with an unmatched pattern.
 */
function messageFromRefusal(): string {
  try {
    generate();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('ManifestGenerator wrote an aggregate where the case expected a refusal');
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'frontx-mfe-gts-ids-'));
  mfePackagesDir = join(workspace, 'src-app', 'mfe_packages');
  outputFile = join(workspace, 'public', 'generated-mfe-manifests.json');
  mkdirSync(mfePackagesDir, { recursive: true });
  mkdirSync(join(workspace, 'public'), { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('ManifestGenerator - GTS identifier validation', () => {
  it('preserves each MFE label dictionary declaration in the served aggregate', () => {
    const declared = [{ language: 'en', file: 'labels/en.json' }];
    mfePackageWithIds({ labelDictionaries: declared });
    writeDictionary();

    generate();

    const aggregate = JSON.parse(readFileSync(outputFile, 'utf-8')) as Array<{ labelDictionaries?: typeof declared }>;
    expect(aggregate[0].labelDictionaries).toEqual(declared);
  });

  it('accepts an empty label dictionary declaration without a public directory', () => {
    mfePackageWithIds({ labelDictionaries: [] });

    generate();

    const aggregate = JSON.parse(readFileSync(outputFile, 'utf-8')) as Array<{ labelDictionaries: unknown[] }>;
    expect(aggregate[0].labelDictionaries).toEqual([]);
  });

  it.each([
    ['non-array declaration', 'labels/en.json', 'must be an array'],
    ['non-object item', [null], 'must be an object'],
    ['non-string language', [{ language: 12, file: 'labels/en.json' }], 'requires only string language and file'],
    ['non-string file', [{ language: 'en', file: 12 }], 'requires only string language and file'],
    ['extra item field', [{ language: 'en', file: 'labels/en.json', id: 'extra' }], 'requires only string language and file'],
    ['unsupported language', [{ language: 'xx', file: 'labels/en.json' }], 'unsupported language'],
    ['repeated language', [{ language: 'en', file: 'labels/en.json' }, { language: 'en', file: 'labels/en.json' }], 'repeats language'],
    ['missing file', [{ language: 'en', file: 'labels/missing.json' }], 'file not found'],
  ])('refuses %s in label dictionaries', (_name, declared, message) => {
    mfePackageWithIds({ labelDictionaries: declared });
    writeDictionary();

    expect(messageFromRefusal()).toContain(message);
    expect(existsSync(outputFile)).toBe(false);
  });

  it.each(['https://example.com/en.json', '/labels/en.json', '//example.com/en.json', '../en.json', 'labels/../en.json', 'labels\\en.json'])('refuses dictionary path %s outside public', (file) => {
    mfePackageWithIds({ labelDictionaries: [{ language: 'en', file }] });
    writeDictionary();

    expect(messageFromRefusal()).toContain('relative path inside public/');
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a public directory linked outside the package', () => {
    mfePackageWithIds({ labelDictionaries: [{ language: 'en', file: 'labels/en.json' }] });
    const external = join(workspace, 'external');
    mkdirSync(external);
    symlinkSync(external, join(mfePackagesDir, PACKAGE_NAME, 'public'));

    expect(messageFromRefusal()).toContain('public/ must be inside the package');
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a declaration when the package has no public directory', () => {
    mfePackageWithIds({ labelDictionaries: [{ language: 'en', file: 'labels/en.json' }] });

    expect(messageFromRefusal()).toContain('public/ directory, which is missing');
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a declared file that is a directory', () => {
    mfePackageWithIds({ labelDictionaries: [{ language: 'en', file: 'labels' }] });
    writeDictionary();

    expect(messageFromRefusal()).toContain('file not found under public/: labels');
    expect(existsSync(outputFile)).toBe(false);
  });

  it.each([
    ['invalid JSON', '{', 'not valid JSON'],
    ['wrong type', { type: 'wrong', language: 'en', labels: [] }, 'wrong type'],
    ['wrong language', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'fr', labels: [] }, 'language does not match en'],
    ['missing labels', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en' }, 'labels must be an array'],
    ['non-object label', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: ['Home'] }, 'labels[0] must be an object'],
    ['non-string extension', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: [{ extension: 12, label: 'Home' }] }, 'labels[0].extension must be a string'],
    ['missing label', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: [{ extension: VALID_EXTENSION_ID }] }, 'labels[0].label must be a non-empty string'],
    ['empty label', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: [{ extension: VALID_EXTENSION_ID, label: '' }] }, 'labels[0].label must be a non-empty string'],
    ['foreign extension', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: [{ extension: `${EXTENSION_TYPE}~fixture.other.screens.home.v1`, label: 'Other' }] }, 'not owned'],
    ['repeated extension', { type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: [{ extension: VALID_EXTENSION_ID, label: 'Home' }, { extension: VALID_EXTENSION_ID, label: 'Start' }] }, 'labels[1] repeats extension'],
  ])('refuses dictionary file with %s', (_name, contents, message) => {
    mfePackageWithIds({ labelDictionaries: [{ language: 'en', file: 'labels/en.json' }] });
    writeDictionary(contents);

    expect(messageFromRefusal()).toContain(message);
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a dictionary label for an owned extension that is not a screen', () => {
    const widgetId = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.widget.v1~fixture.billing.widgets.card.v1';
    mfePackageWithIds({ extensionId: widgetId, labelDictionaries: [{ language: 'en', file: 'labels/en.json' }] });
    writeDictionary({ type: 'gts.frontx.i18n.dict.screen_labels.v1~', language: 'en', labels: [{ extension: widgetId, label: 'Card' }] });

    expect(messageFromRefusal()).toContain('labels[0].extension is not a screen extension');
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses the run when an extension id carries a segment one dot-token short of five', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    expect(messageFromRefusal()).toContain(`extensions[0].id: "${FOUR_TOKEN_EXTENSION_ID}"`);
  });

  it('names the mfe.json to edit and teaches the grammar with an id that parses', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    const message = messageFromRefusal();

    expect(message).toContain(join(mfePackagesDir, PACKAGE_NAME, 'mfe.json'));
    expect(message).toContain('gts.vendor.package.namespace.type.vN');
  });

  it('offers an example the parser actually accepts, since the refusal is what teaches the shape', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    // Pull the example out of the message and put it back through GTS. Writing
    // the shape by hand is how the previous wording came to describe five
    // dot-tokens for a leading segment that needs the `gts.` prefix on top of
    // them, so the case reads the parser rather than a second hand-written rule.
    const example = messageFromRefusal().match(/For example: (\S+)/)?.[1];

    expect(example).toBeDefined();
    expect(Gts.validateGtsID(example as string).ok).toBe(true);
  });

  it('refuses a manifest carrying no extensions array, rather than writing an aggregate without one', () => {
    // The dangerous half: with every id valid, an absent `extensions` used to
    // pass validation and reach the aggregate with the key silently dropped by
    // JSON.stringify. That is a green build and an empty navigation menu, which
    // is the failure the id gate exists to prevent, reached another way.
    mfePackageWithIds({ omitExtensions: true });

    const message = messageFromRefusal();

    expect(message).toContain("carries no 'extensions' array");
    expect(existsSync(outputFile)).toBe(false);
  });

  it('refuses a manifest carrying no entries array, naming the package instead of dying inside buildEntries', () => {
    // The loud half, but loud in the wrong voice: `buildEntries` died on
    // `Cannot read properties of undefined (reading 'map')`, a stack pointing at
    // the generator rather than at the package to rebuild.
    mfePackageWithIds({ omitEntries: true });

    const message = messageFromRefusal();

    expect(message).toContain("carries no 'entries' array");
    expect(message).not.toContain('reading \'map\'');
  });

  it('names both collections when both are absent', () => {
    mfePackageWithIds({ omitEntries: true, omitExtensions: true });

    expect(messageFromRefusal()).toContain("carries no 'entries' and 'extensions' arrays");
  });

  it('accepts empty collections, which is what an MFE contributing nothing writes', () => {
    mfePackageWithIds({ emptyCollections: true });

    expect(() => generate()).not.toThrow();
    expect(existsSync(outputFile)).toBe(true);
  });

  it('writes no aggregate when an id is refused', () => {
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    expect(() => generate()).toThrow();
    expect(existsSync(outputFile)).toBe(false);
  });

  it('removes the aggregate an earlier good run left behind, and still names the offending id', () => {
    writeFileSync(outputFile, EARLIER_GOOD_AGGREGATE, 'utf-8');
    mfePackageWithIds({ extensionId: FOUR_TOKEN_EXTENSION_ID });

    const message = messageFromRefusal();

    // The case the clean-tree assertion above cannot make: the file outlives the
    // run that wrote it, so a refusal has to unlink it rather than merely skip
    // writing. Left in place, the host mounts the last good manifest at bootstrap
    // and the failed generation leaves no visible trace.
    expect(existsSync(outputFile)).toBe(false);
    expect(message).toContain(FOUR_TOKEN_EXTENSION_ID);
  });

  it('removes the aggregate when a package fails for a reason other than its ids', () => {
    writeFileSync(outputFile, EARLIER_GOOD_AGGREGATE, 'utf-8');
    // An unbuilt package: discovery accepts it on `mfe.json` alone, and the read
    // of its enriched manifest is what fails. Pins that the removal is scoped to
    // the generation run rather than to the id gate.
    mkdirSync(join(mfePackagesDir, PACKAGE_NAME), { recursive: true });
    writeFileSync(join(mfePackagesDir, PACKAGE_NAME, 'mfe.json'), '{ "extensions": [] }', 'utf-8');

    expect(() => generate()).toThrow(/not found/);
    expect(existsSync(outputFile)).toBe(false);
  });

  it('removes the aggregate when the packages directory cannot be read at all', () => {
    writeFileSync(outputFile, EARLIER_GOOD_AGGREGATE, 'utf-8');
    // A file where the packages directory belongs: `existsSync` is satisfied, so
    // the run reaches `readdirSync` and dies there. Discovery failing is the one
    // way to fail that runs before any package is processed, so it is the case
    // that pins the guard around discovery rather than only around the packages.
    rmSync(mfePackagesDir, { recursive: true, force: true });
    writeFileSync(mfePackagesDir, 'not a directory', 'utf-8');

    expect(() => generate()).toThrow();
    expect(existsSync(outputFile)).toBe(false);
  });

  it('reports every invalid id in the package rather than stopping at the first', () => {
    mfePackageWithIds({
      manifestId: `${MANIFEST_TYPE}~fixture.billing.manifest.v1`,
      extensionId: FOUR_TOKEN_EXTENSION_ID,
    });

    expect(messageFromRefusal()).toContain('3 invalid GTS identifier(s)');
  });

  it('accepts an id carrying the optional minor version, which a five-token-exact rule would reject', () => {
    mfePackageWithIds({ manifestId: `${MANIFEST_TYPE}~fixture.billing.mfe.manifest.v1.2` });

    expect(() => generate()).not.toThrow();
  });

  it('writes the aggregate when every id parses', () => {
    mfePackageWithIds({});

    generate();

    expect(existsSync(outputFile)).toBe(true);
  });
});
