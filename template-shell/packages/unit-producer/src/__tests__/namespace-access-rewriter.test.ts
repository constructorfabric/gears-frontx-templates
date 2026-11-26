import { describe, expect, it } from 'vitest';

import { NamespaceAccessRewriter } from '../NamespaceAccessRewriter';

/**
 * Scenario: namespace-import use classification. A namespace
 * import rewrites only when every reference to its local name is a
 * statically resolvable `ns.Member` read — the import specifier's own
 * binding identifier is not a use, and a member expression that is
 * written, deleted, updated or otherwise dynamic keeps the import
 * exactly as written.
 */

describe('NamespaceAccessRewriter.analyze — use classification', () => {
  it('excludes the import\'s own specifier: a member-read-only namespace rewrites', () => {
    const ns = NamespaceAccessRewriter.analyze(
      "import * as Select from 'pkg';\nSelect.Item();\nconst trigger = Select.Trigger;\n",
      'mod.js'
    );
    const use = ns?.get('Select')?.use;
    expect(use?.onlyMembers).toBe(true);
    expect(use?.accesses.map((a) => a.member)).toEqual(['Item', 'Trigger']);
  });

  it('counts member reads on several namespaces independently', () => {
    const ns = NamespaceAccessRewriter.analyze(
      "import * as A from 'pkg-a';\nimport * as B from 'pkg-b';\nA.One();\ntake(B);\n",
      'mod.js'
    );
    expect(ns?.get('A')?.use.onlyMembers).toBe(true);
    expect(ns?.get('A')?.use.accesses.map((a) => a.member)).toEqual(['One']);
    expect(ns?.get('B')?.use.onlyMembers).toBe(false);
  });

  it.each([
    ['an assignment target', "import * as NS from 'pkg';\nNS.Foo = 1;\n"],
    ['a compound-assignment target', "import * as NS from 'pkg';\nNS.Foo += 1;\n"],
    ['a delete operand', "import * as NS from 'pkg';\ndelete NS.Foo;\n"],
    ['an update operand', "import * as NS from 'pkg';\nNS.Foo++;\n"],
    ['a prefix-update operand', "import * as NS from 'pkg';\n++NS.Foo;\n"],
    ['a for-of binding', "import * as NS from 'pkg';\nfor (NS.Foo of list) {}\n"],
    ['a for-in binding', "import * as NS from 'pkg';\nfor (NS.Foo in obj) {}\n"],
    ['the namespace passed whole', "import * as NS from 'pkg';\ntake(NS);\n"],
    ['a computed access', "import * as NS from 'pkg';\nNS[key]();\n"],
    ['a destructuring source', "import * as NS from 'pkg';\nconst { Foo } = NS;\n"],
    ['a spread source', "import * as NS from 'pkg';\nconst copy = { ...NS };\n"],
    ['a re-export', "import * as NS from 'pkg';\nexport { NS };\n"],
  ])('a dynamic use — %s — leaves the import untouched', (_label, source) => {
    const use = NamespaceAccessRewriter.analyze(source, 'mod.js')?.get('NS')?.use;
    expect(use?.onlyMembers).toBe(false);
    expect(use?.accesses).toEqual([]);
  });
});
