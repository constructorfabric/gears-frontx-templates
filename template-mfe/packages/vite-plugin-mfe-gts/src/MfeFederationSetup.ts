/**
 * `MfeFederationSetup` — the Module Federation half the plugin owns.
 * A FrontX MFE's federation settings are a contract, not a choice: the
 * federation name comes from the MFE's own `package.json`, the remote
 * entry is always `remoteEntry.js`, `shared` is always `{}` (the unit
 * mechanism, never MF 2.0 sharing, provides shared dependencies — a
 * user-configured federation plugin is a build error), and the manifest
 * is always emitted because the enriched `mfe-manifest.json` builds on
 * it; no federated type bundle is generated (`dts: false`). The only thing an MFE still declares is its `exposes` map — via
 * plugin options or `mfe.json`'s `exposes` field.
 *
 * The setup reads `package.json` and `mfe.json` from the package root at
 * construction (the Vite config file runs with the package root as
 * `cwd`), builds the `@module-federation/vite` plugin array and keeps
 * the returned objects so `MfeGtsPlugin` can tell them apart from a
 * federation plugin the user added by hand.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { federation } from '@module-federation/vite';
import type { Plugin } from 'vite';

import type { MfeJson } from './types';

/** The federation options the setup fixes; only `exposes` varies. */
export interface MfeFederationSettings {
  name: string;
  filename: 'remoteEntry.js';
  exposes?: Record<string, string>;
  shared: Record<string, never>;
  manifest: true;
}

export class MfeFederationSetup {
  private readonly settings: MfeFederationSettings;
  private readonly ownedPlugins = new Set<object>();

  constructor(packageRoot: string, exposes?: Record<string, string>) {
    this.settings = {
      name: MfeFederationSetup.deriveName(
        MfeFederationSetup.readPackageName(packageRoot)
      ),
      filename: 'remoteEntry.js',
      exposes:
        exposes ?? MfeFederationSetup.readMfeJsonExposes(packageRoot),
      shared: {},
      manifest: true,
    };
  }

  /** The federation options `federation()` receives. */
  getSettings(): MfeFederationSettings {
    return { ...this.settings, shared: {}, manifest: true };
  }

  /**
   * The `@module-federation/vite` plugin array, created once; every
   * returned object is remembered for foreign-plugin detection.
   */
  plugins(): Plugin[] {
    if (this.ownedPlugins.size === 0) {
      // No federated type bundle (`@mf-types`): the FrontX host loads an
      // MFE through its GTS manifest, never through Module Federation's
      // remote type sync, so nothing reads those types (the shell's dist
      // layout leaves any such bundle out).
      const created = federation({ ...this.settings, dts: false }) as Plugin[];
      for (const plugin of created) this.ownedPlugins.add(plugin);
      return created;
    }
    return [...this.ownedPlugins] as Plugin[];
  }

  /** Whether `plugin` is one this setup created. */
  owns(plugin: unknown): boolean {
    return this.ownedPlugins.has(plugin as object);
  }

  /**
   * `package.json` `name` → the federation name: scope stripped, then
   * camelCase (`@scope/my-mfe` → `myMfe`). Matches the names the
   * scaffolded MFEs used to write by hand.
   */
  static deriveName(packageName: string): string {
    const base = packageName.split('/').pop() ?? packageName;
    const derived = base.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) =>
      c === undefined ? '' : c.toUpperCase()
    );
    // A federation name must be a usable identifier: a package whose
    // name starts with a digit (`3d-widgets` → `3dWidgets`) gets the
    // `mfe` prefix rather than an identifier no host can reference.
    if (/^[0-9]/.test(derived)) {
      return `mfe${derived[0].toUpperCase()}${derived.slice(1)}`;
    }
    return derived === '' ? 'mfe' : derived;
  }

  private static readPackageName(packageRoot: string): string {
    const file = path.join(packageRoot, 'package.json');
    let name: unknown;
    try {
      name = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { name?: unknown })
        .name;
    } catch {
      // covered below
    }
    if (typeof name !== 'string' || name === '') {
      throw new Error(
        `[vite-plugin-mfe-gts] cannot derive the federation name: ` +
          `'${file}' carries no "name" field.`
      );
    }
    return name;
  }

  /** `exposes` from `mfe.json`, when the file declares one. */
  private static readMfeJsonExposes(
    packageRoot: string
  ): Record<string, string> | undefined {
    const file = path.join(packageRoot, 'mfe.json');
    if (!fs.existsSync(file)) return undefined;
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as MfeJson;
      return json.exposes;
    } catch {
      return undefined;
    }
  }
}
