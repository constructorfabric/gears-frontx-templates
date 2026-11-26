/**
 * `ShellBuildReport` reads each listed unit's size from the directory the
 * units were written to, whatever the working directory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ProducedSharedPackage } from '@gears-frontx/unit-producer';
import { afterEach, describe, expect, it } from 'vitest';

import { ShellBuildReport } from '../ShellBuildReport';

describe('ShellBuildReport', () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (tmp !== undefined) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('counts the reachable bytes of the units under the absolute shared dir', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vpsh-report-'));
    const sharedDir = path.join(tmp, 'dist', 'shared');
    fs.mkdirSync(path.join(sharedDir, 'pkg@1.0.0'), { recursive: true });
    fs.writeFileSync(path.join(sharedDir, 'pkg@1.0.0', 'index.js'), 'export const x = 1;\n');
    const produced = {
      name: 'pkg',
      version: '1.0.0',
      unitMode: 'single',
      barrelMode: 'not-needed',
      chunkBytes: 20,
      lists: { pkg: { items: [{ location: 'pkg@1.0.0/index.js' }] } },
    } as unknown as ProducedSharedPackage;

    const report = ShellBuildReport.compose({
      host: 'host',
      sharedOutDir: 'shared',
      sharedDir,
      produced: [produced],
      stageTimings: {} as never,
    });

    expect(process.cwd()).not.toBe(path.join(tmp, 'dist'));
    expect(report.packages[0].reachableBytes).toBe(20);
    expect(report.reachableBytes).toBe(20);
  });

  it('fails naming the package and location when a listed unit is missing', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vpsh-report-'));
    const sharedDir = path.join(tmp, 'dist', 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    const produced = {
      name: 'pkg',
      version: '1.0.0',
      unitMode: 'single',
      barrelMode: 'not-needed',
      chunkBytes: 20,
      lists: { pkg: { items: [{ location: 'pkg@1.0.0/gone.js' }] } },
    } as unknown as ProducedSharedPackage;

    expect(() =>
      ShellBuildReport.compose({
        host: 'host',
        sharedOutDir: 'shared',
        sharedDir,
        produced: [produced],
        stageTimings: {} as never,
      })
    ).toThrow(/pkg@1\.0\.0.*pkg@1\.0\.0\/gone\.js|pkg@1\.0\.0\/gone\.js.*pkg@1\.0\.0/s);
  });
});
