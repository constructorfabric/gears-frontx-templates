import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsumerBarrelFallback } from '../ConsumerBarrelFallback';
import { ConsumerBarrelResolver } from '../ConsumerBarrelResolver';
import { ConsumerBarrelRewriteLedger } from '../ConsumerBarrelRewriteLedger';
import { ConsumerBarrelRewriteTransform } from '../ConsumerBarrelRewriteTransform';
import { UnitProducer, type ProducedSharedPackage } from '../UnitProducer';

/**
 * Scenario: a consumer import rewritten through a nested barrel whose
 * chain renames the binding (`export { default as Button }`). The
 * rewrite lands on the defining module with its own export name, but
 * the unit answering that module path is the nested barrel's entry
 * chunk, which exports only the barrel's names. A rewrite stands only
 * when the answering unit exports every name the consumer imports from
 * it; otherwise it goes back to the barrel.
 */

let root: string;
let produced: ProducedSharedPackage[];
const ledger = new ConsumerBarrelRewriteLedger();
let rewritten: string | undefined;

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'nested-barrel-')));
  write(
    join(root, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '0.0.0', dependencies: { ui: '1.0.0' } })
  );
  const ui = join(root, 'node_modules', 'ui');
  write(
    join(ui, 'package.json'),
    JSON.stringify({ name: 'ui', version: '1.0.0', type: 'module', sideEffects: false, main: './index.js' })
  );
  write(join(ui, 'index.js'), "export * from './components/index.js';\n");
  write(join(ui, 'components/index.js'), "export * from './Button/index.js';\n");
  write(
    join(ui, 'components/Button/index.js'),
    "export { default as Button } from './Button.js';\n"
  );
  write(
    join(ui, 'components/Button/Button.js'),
    'export default function Button() { return "button"; }\n'
  );

  const transform = new ConsumerBarrelRewriteTransform({
    resolver: new ConsumerBarrelResolver({ packageRoot: root, isShared: (n) => n === 'ui' }),
    ledger,
  });
  rewritten = (await transform.transform("import { Button } from 'ui';\nButton();\n"))?.code;
  produced = await new UnitProducer({
    packageRoot: root,
    outputDir: join(root, 'out'),
    consumerSpecifiers: [...ledger.targets()],
  }).produce((message) => {
    throw new Error(message);
  });
}, 60_000);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('nested barrel with a renamed re-export', () => {
  it('rewrites the consumer import to the defining module', () => {
    expect(rewritten).toContain("from 'ui/components/Button/Button.js'");
  });

  it('records the names each produced unit exports', () => {
    const ui = produced.find((p) => p.name === 'ui')!;
    const answering = ui.units.find(
      (u) => u.location === ui.entryUnits['ui/components/Button/Button.js']
    );
    expect(answering?.exports).toBeDefined();
    expect(answering?.exports).not.toContain('default');
  });

  it('falls back to the barrel when the answering unit does not export the imported name', () => {
    const unanswered = ConsumerBarrelFallback.unanswered(produced, ledger);
    expect([...unanswered.keys()]).toEqual(['ui/components/Button/Button.js']);
    expect(unanswered.get('ui/components/Button/Button.js')).toMatch(/does not export "default"/);
  });
});
