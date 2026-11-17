/**
 * The default screen's selection, as a pure function: what the shell opens
 * when the address names no screen, and the order the menu lists screens in,
 * which the same functions serve so the two cannot drift.
 */
import { describe, expect, it } from 'vitest';
import {
  addressScreenEntry,
  firstScreenId,
  screensInMenuOrder,
  type RegistryScreenExtension,
} from './defaultScreen';

const screen = (id: string, order?: number): RegistryScreenExtension => ({
  id,
  domain: 'screen-domain',
  entry: `${id}.entry`,
  presentation: order === undefined ? { label: id } : { label: id, order },
});

/**
 * An extension the registry accepts and the menu cannot render: `presentation`
 * is asserted by a cast rather than validated anywhere on the registration
 * path, so this shape reaches the menu in a real boot.
 */
const withoutPresentation = (id: string) =>
  ({ id, domain: 'screen-domain', entry: `${id}.entry` }) as RegistryScreenExtension;

describe('firstScreenId', () => {
  it('picks the lowest presentation order, not the first registered and not the alphabetically first', () => {
    expect(firstScreenId([screen('alpha', 3), screen('zulu', 1), screen('mid', 2)])).toBe('zulu');
  });

  it('sorts a screen without an order at the 999 mark, after lower orders and before higher ones', () => {
    const orderless = screen('plain');
    expect(firstScreenId([screen('late', 1000), orderless])).toBe('plain');
    expect(firstScreenId([orderless, screen('early', 998)])).toBe('early');
  });

  it('keeps registration order between ties, and between screens that all lack an order', () => {
    expect(firstScreenId([screen('second', 2), screen('first', 2)])).toBe('second');
    expect(firstScreenId([screen('b'), screen('a')])).toBe('b');
  });

  it('skips extensions without presentation metadata, and selects nothing when none is left', () => {
    expect(firstScreenId([withoutPresentation('broken'), screen('present', 5)])).toBe('present');
    expect(
      firstScreenId([withoutPresentation('broken-one'), withoutPresentation('broken-two')]),
    ).toBeUndefined();
  });

  it('selects nothing from an empty list', () => {
    expect(firstScreenId([])).toBeUndefined();
  });
});

describe('screensInMenuOrder', () => {
  it('returns the full list the menu shows, in the order the default screen selects from', () => {
    const ordered = screensInMenuOrder([
      screen('third', 3),
      withoutPresentation('broken'),
      screen('first', 1),
      screen('second', 2),
    ]);

    expect(ordered.map((extension) => extension.id)).toEqual(['first', 'second', 'third']);
  });
});

describe('addressScreenEntry', () => {
  it('reads the screen entry from the query string', () => {
    expect(addressScreenEntry('?screen=orders')).toBe('orders');
  });

  it('finds none when the address carries no screen entry', () => {
    expect(addressScreenEntry('')).toBeUndefined();
    expect(addressScreenEntry('?other=1')).toBeUndefined();
  });

  it('counts an empty screen value as no entry', () => {
    expect(addressScreenEntry('?screen=')).toBeUndefined();
    expect(addressScreenEntry('?screen&x=1')).toBeUndefined();
  });
});
