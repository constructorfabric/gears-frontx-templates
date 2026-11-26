import { describe, expect, it } from 'vitest';
import { SessionFixtures } from './SessionFixtures.mjs';

const EXTENSIONS = [
  { id: 'ext.hello', kind: 'visual', label: 'Hello World', domain: 'screen' },
  { id: 'ext.profile', kind: 'visual', label: 'Profile', domain: 'screen' },
  { id: 'ext.theme', kind: 'visual', label: 'Current Theme', domain: 'screen' },
  { id: 'ext.uikit', kind: 'visual', label: 'UIKit Elements', domain: 'screen' },
  { id: 'ext.blank', kind: 'visual', label: 'Blank Home', domain: 'screen' },
];

describe('SessionFixtures — session-fixture selection', () => {
  it('records a fixed extension sequence at construction (the old rule runs the same sequence)', () => {
    const sf = new SessionFixtures({ extensions: EXTENSIONS, singleExtensionId: 'ext.blank' });
    const seq = sf.recordedSequence();
    expect(seq).toEqual(EXTENSIONS.map((e) => e.id));
    // The sequence is stable across calls — the harness records it once.
    expect(sf.recordedSequence()).toBe(seq);
  });

  it('selects shell+1 (the single extension named by id, whatever its label)', () => {
    const sf = new SessionFixtures({ extensions: EXTENSIONS, singleExtensionId: 'ext.blank' });
    const sel = sf.select('shell+1');
    expect(sel).toHaveLength(1);
    expect(sel[0].id).toBe('ext.blank');
  });

  it('selects shell+5 sequential (five distinct extensions opened one after another)', () => {
    const sf = new SessionFixtures({ extensions: EXTENSIONS, singleExtensionId: 'ext.blank' });
    const sel = sf.select('shell+5-sequential');
    expect(sel).toHaveLength(5);
    const ids = sel.map((e) => e.id);
    expect(new Set(ids).size).toBe(5); // five distinct
    // The sequential order is the recorded sequence's first five visual.
    expect(ids).toEqual(['ext.hello', 'ext.profile', 'ext.theme', 'ext.uikit', 'ext.blank']);
  });

  it('excludes the boot-mounted default screen from both five-extension sessions', () => {
    const extensions = [...EXTENSIONS, { id: 'ext.widgets', kind: 'visual', label: 'Widgets Host', domain: 'screen' }];
    const sf = new SessionFixtures({ extensions, singleExtensionId: 'ext.blank', defaultExtensionId: 'ext.hello' });
    const expected = ['ext.profile', 'ext.theme', 'ext.uikit', 'ext.blank', 'ext.widgets'];
    expect(sf.select('shell+5-sequential').map((e) => e.id)).toEqual(expected);
    expect(sf.select('shell+5-parallel-startup').map((e) => e.id)).toEqual(expected);
  });

  it("selects shell+5 parallel startup (five visual startup extensions, loaded together right after bootstrap)", () => {
    const sf = new SessionFixtures({ extensions: EXTENSIONS, singleExtensionId: 'ext.blank' });
    const sel = sf.select('shell+5-parallel-startup');
    expect(sel).toHaveLength(5);
    // Only visual startup extensions; no headless case.
    expect(sel.every((e) => e.kind === 'visual')).toBe(true);
    const ids = sel.map((e) => e.id);
    expect(ids).toEqual(['ext.hello', 'ext.profile', 'ext.theme', 'ext.uikit', 'ext.blank']);
  });

  it('startupExtensionIds returns the shell startup extension ids (visual only)', () => {
    const sf = new SessionFixtures({ extensions: EXTENSIONS, singleExtensionId: 'ext.blank' });
    const ids = sf.startupExtensionIds();
    expect(ids).toEqual(['ext.hello', 'ext.profile', 'ext.theme', 'ext.uikit', 'ext.blank']);
  });

  it('throws on an unknown session kind', () => {
    const sf = new SessionFixtures({ extensions: EXTENSIONS, singleExtensionId: 'ext.blank' });
    expect(() => sf.select('shell+99')).toThrow(/unknown session kind/);
  });

  it('fails closed when there are not enough visual extensions for shell+5-parallel-startup', () => {
    const tooFew = EXTENSIONS.slice(0, 4); // only four visual startup extensions
    const sf = new SessionFixtures({ extensions: tooFew });
    expect(() => sf.select('shell+5-parallel-startup')).toThrow(/not enough visual startup extensions/);
  });
});
