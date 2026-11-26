import { describe, expect, it } from 'vitest';

import { UnitExportNames } from '../UnitExportNames';

describe('UnitExportNames.of', () => {
  const cases: Array<[string, string, string[] | undefined]> = [
    ['a default export', 'export default function () {}', ['default']],
    ['a renamed export', 'const a = 1;\nexport { a as b };', ['b']],
    ['a plain export list', 'const a = 1, c = 2;\nexport { a, c };', ['a', 'c']],
    ['a quoted export name', 'const a = 1;\nexport { a as "b" };', ['b']],
    ['a quoted export name that restores a member', 'function f(){}\nexport { f as "f" };', ['f']],
    ['a default alias', 'const a = 1;\nexport { a as default };', ['default']],
    ['a destructured const', 'const o = {};\nexport const { p, q: r, ...rest } = o;', ['p', 'r', 'rest']],
    ['an array destructured const', 'export const [first, , third = 3] = [];', ['first', 'third']],
    ['a function and a class', 'export function f() {}\nexport class C {}', ['C', 'f']],
    ['a generator function', 'export function* g() {}', ['g']],
    ['a namespace re-export', "export * as ns from './x.js';", ['ns']],
    ['a named re-export', "export { y as z } from './x.js';", ['z']],
    ['a plain star re-export, whose names the text does not spell', "export * from './x.js';", undefined],
    ['a star re-export beside spelled names', "export * from './x.js';\nexport const a = 1;", undefined],
    ['no exports', 'const a = 1;', []],
  ];

  it.each(cases)('reads %s', (_name, source, names) => {
    expect(UnitExportNames.of(source)).toEqual(names);
  });

  it('fails, naming the unit, for a text that cannot be parsed', () => {
    expect(() => UnitExportNames.of('export {{{', 'pkg@1.0.0/x.abc.js')).toThrow(
      /unit "pkg@1\.0\.0\/x\.abc\.js" cannot be parsed/
    );
  });
});
