import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The ports the e2e servers listen on, shared by the server, the Playwright
 * configuration, the browser specs and the boot check so a change is made in
 * one place. Fixture MFE ports are not here: each fixture's own `mfe.json`
 * (`manifest.remoteEntry`) decides its port.
 */

/** Shell, no CSP. */
export const SHELL_PORT = 4173;
/** Shell under a CSP that allows `blob:` script-src. */
export const SHELL_PORT_CSP_BLOB = 4174;
/** Shell under a nonce-based CSP with `'strict-dynamic'` and `blob:`. */
export const SHELL_PORT_CSP_STRICT = 4175;

/**
 * The ports the fixture MFE origins listen on: the port of each package's
 * authored `manifest.remoteEntry` in `<mfePackagesDir>/<package>/mfe.json`.
 *
 * @param {string} mfePackagesDir
 * @returns {number[]}
 */
export function fixturePorts(mfePackagesDir) {
  return readdirSync(mfePackagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(mfePackagesDir, d.name, 'mfe.json')))
    .map((d) => JSON.parse(readFileSync(join(mfePackagesDir, d.name, 'mfe.json'), 'utf-8')))
    .map((authored) => Number(new URL(authored.manifest.remoteEntry).port));
}
