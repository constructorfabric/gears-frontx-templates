/**
 * The enriched `dist/mfe-manifest.json` is the closed served contract: the
 * manifest carries only `id`, `metaData`, `units` and `lists` — no `shared`, each
 * entry carries `exposeAssets { js: { sync }, css: { sync, async } }`, and
 * the type system's closed `mf_manifest` / `entry_mf` schemas accept it.
 */

import { describe, expect, it } from 'vitest';
import { GtsEntityValidator } from '../GtsEntityValidator';
import { MfeManifestEnricher } from '../MfeManifestEnricher';
import type { FederationManifest, MfeJson } from '../types';

const MANIFEST_ID =
  'gts.frontx.mfes.mfe.mf_manifest.v1~acme.demo.mfe.manifest.v1';
const ENTRY_ID =
  'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.demo.mfe.entry.v1';

const mfeJson = (): MfeJson => ({
  manifest: { id: MANIFEST_ID, remoteEntry: 'remoteEntry.js' },
  entries: [
    {
      id: ENTRY_ID,
      requiredProperties: [],
      actions: [],
      domainActions: [],
      manifest: MANIFEST_ID,
      exposedModule: './lifecycle',
    },
  ],
});

const federation = (withCssAsync: boolean): FederationManifest => ({
  id: 'demo',
  name: 'demo',
  metaData: {
    name: 'demo',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'demo' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'demo',
    publicPath: 'http://localhost:3001/',
  },
  shared: [],
  remotes: [],
  exposes: [
    {
      id: 'demo:lifecycle',
      name: 'lifecycle',
      path: './lifecycle',
      assets: {
        js: { sync: ['assets/lifecycle.js'], async: ['assets/lazy.js'] },
        css: {
          sync: ['assets/lifecycle.css'],
          ...(withCssAsync ? { async: ['assets/lazy.css'] } : {}),
        } as { sync: string[]; async: string[] },
      },
    },
  ],
});

function enrich(withCssAsync = true) {
  return new MfeManifestEnricher().enrich(
    mfeJson(),
    federation(withCssAsync),
    {
      sharedBase: './shared/',
      units: [
        {
          location: 'react@19.2.4/index.js',
          contentHash: 'a'.repeat(64),
          answers: ['react'],
          imports: [],
        },
      ],
      lists: {
        './lifecycle': { units: ['a'.repeat(64)], ownChunks: ['assets/own.js'] },
      },
    }
  );
}

describe('MfeManifestEnricher closed output', () => {
  it('emits only the closed manifest fields', () => {
    const { manifest } = enrich();
    expect(Object.keys(manifest).sort()).toEqual(
      ['id', 'lists', 'metaData', 'units'].sort()
    );
    expect(manifest.metaData).toEqual({
      publicPath: 'http://localhost:3001/',
      sharedBase: './shared/',
    });
    expect('shared' in manifest).toBe(false);
  });

  it('emits exposeAssets as js.sync and css.sync/css.async only', () => {
    const { entries } = enrich();
    expect(entries[0]!.exposeAssets).toEqual({
      js: { sync: ['assets/lifecycle.js'] },
      css: { sync: ['assets/lifecycle.css'], async: ['assets/lazy.css'] },
    });
  });

  it('emits an empty css.async when the federation manifest lacks it', () => {
    const { entries } = enrich(false);
    expect(entries[0]!.exposeAssets.css.async).toEqual([]);
  });

  it('is accepted by the closed gts-plugin manifest and entry schemas', () => {
    const enriched = enrich();
    expect(() =>
      new GtsEntityValidator().assertValid({
        manifest: enriched.manifest,
        entries: enriched.entries,
      })
    ).not.toThrow();
  });

  it('fails the build when an entry names a manifest other than the package manifest id', () => {
    const json = mfeJson();
    json.entries[0]!.manifest = 'gts.frontx.mfes.mfe.mf_manifest.v1~acme.demo.mfe.other.v1';
    expect(() =>
      new MfeManifestEnricher().enrich(json, federation(true))
    ).toThrow(/names manifest .*other.*package's manifest is/);
  });

  it('is rejected by the type system when an unlisted shared[] field is added', () => {
    const enriched = enrich();
    expect(() =>
      new GtsEntityValidator().assertValid({
        manifest: {
          ...enriched.manifest,
          shared: [{ name: 'react', version: '19.2.4', chunkPath: 'shared/react.js', graphFile: 'x' }],
        },
        entries: [],
      })
    ).toThrow(/rejected by the type system/);
  });

  it('is rejected by the type system when an unlisted entry field is added', () => {
    const enriched = enrich();
    expect(() =>
      new GtsEntityValidator().assertValid({
        manifest: enriched.manifest,
        entries: [{ ...enriched.entries[0]!, extra: true }],
      })
    ).toThrow(/rejected by the type system/);
  });

  it('is rejected by the type system when js.sync is empty', () => {
    const enriched = enrich();
    const entry = enriched.entries[0]!;
    expect(() =>
      new GtsEntityValidator().assertValid({
        manifest: enriched.manifest,
        entries: [{ ...entry, exposeAssets: { ...entry.exposeAssets, js: { sync: [] } } }],
      })
    ).toThrow(/rejected by the type system/);
  });

  it('is rejected by the type system when an unlisted manifest field is added', () => {
    const enriched = enrich();
    expect(() =>
      new GtsEntityValidator().assertValid({
        manifest: { ...enriched.manifest, extra: 'demo' },
        entries: [],
      })
    ).toThrow(/rejected by the type system/);
  });
});
