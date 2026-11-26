import { describe, expect, it } from 'vitest';

import { ExportClauseMembers } from '../ExportClauseMembers';

describe('ExportClauseMembers.of', () => {
  it('reads plain, renamed and quoted members of every clause', () => {
    const text = [
      'export { a, b as c };',
      'export{d as "e"};',
      'export { "f" as g };',
      "export{h as 'i'};",
      'export { default as j };',
      'export { k as default };',
    ].join('\n');
    expect(ExportClauseMembers.of(text)).toEqual([
      { local: 'a', exported: 'a' },
      { local: 'b', exported: 'c' },
      { local: 'd', exported: 'e' },
      { local: 'f', exported: 'g' },
      { local: 'h', exported: 'i' },
      { local: 'default', exported: 'j' },
      { local: 'k', exported: 'default' },
    ]);
  });

  it('skips a member that is no plain name', () => {
    expect(ExportClauseMembers.of('export { a as "b-c", d };')).toEqual([{ local: 'd', exported: 'd' }]);
  });
});
