import { describe, expect, it } from 'vitest';
import { CompressionMatrix } from './CompressionMatrix.mjs';

describe('CompressionMatrix — server compression negotiation (compression_matrix)', () => {
  it('precomputes gzip and brotli bytes once at construction (no per-request compression time)', () => {
    const body = Buffer.from('a'.repeat(2048), 'utf-8');
    const cm = new CompressionMatrix({ files: [{ path: '/a.js', body }] });
    const pre = cm.precompressed('/a.js');
    expect(pre.none).toBe(body);
    expect(pre.gzip.length).toBeLessThan(body.length);
    expect(pre.brotli.length).toBeLessThan(body.length);
    expect(pre.gzip.length).not.toBe(body.length);
    expect(pre.brotli.length).not.toBe(body.length);
  });

  it('serves by Accept-Encoding with br > gzip > none priority', () => {
    const body = Buffer.from('a'.repeat(1024), 'utf-8');
    const cm = new CompressionMatrix({ files: [{ path: '/a.js', body }] });
    expect(cm.negotiate('/a.js', 'gzip, deflate').encoding).toBe('gzip');
    expect(cm.negotiate('/a.js', 'br').encoding).toBe('brotli');
    expect(cm.negotiate('/a.js', 'gzip, br').encoding).toBe('brotli');
    expect(cm.negotiate('/a.js', 'identity').encoding).toBe('none');
    expect(cm.negotiate('/a.js', '').encoding).toBe('none');
  });

  it('honors q-values in Accept-Encoding', () => {
    const body = Buffer.from('a'.repeat(1024), 'utf-8');
    const cm = new CompressionMatrix({ files: [{ path: '/a.js', body }] });
    // gzip;q=0.9, br;q=0.1 → gzip wins
    expect(cm.negotiate('/a.js', 'gzip;q=0.9, br;q=0.1').encoding).toBe('gzip');
    // br;q=0, gzip → gzip wins (br disabled)
    expect(cm.negotiate('/a.js', 'br;q=0, gzip').encoding).toBe('gzip');
  });

  it('pins a compression dimension so a run can force none/gzip/brotli for every cell (overrides Accept-Encoding)', () => {
    const body = Buffer.from('a'.repeat(1024), 'utf-8');
    const cm = new CompressionMatrix({ files: [{ path: '/a.js', body }] });
    cm.setDimension('none');
    expect(cm.negotiate('/a.js', 'br').encoding).toBe('none');
    cm.setDimension('gzip');
    // Pinned gzip is served regardless of the client's Accept-Encoding
    // — the measurement harness controls the client and sends a
    // matching Accept-Encoding; the pin forces the server's choice.
    expect(cm.negotiate('/a.js', 'br').encoding).toBe('gzip');
    cm.setDimension('brotli');
    expect(cm.negotiate('/a.js', 'gzip').encoding).toBe('brotli');
    // Clearing the dimension restores Accept-Encoding negotiation.
    cm.setDimension(undefined);
    expect(cm.negotiate('/a.js', 'gzip, br').encoding).toBe('brotli');
  });

  it('the old rule is served with identical compression settings in every cell', () => {
    const body = Buffer.from('a'.repeat(1024), 'utf-8');
    const cm = new CompressionMatrix({ files: [{ path: '/a.js', body }] });
    cm.setDimension('gzip');
    const a = cm.negotiate('/a.js', 'gzip, br');
    cm.setDimension('gzip');
    const b = cm.negotiate('/a.js', 'gzip, br');
    expect(a.encoding).toBe(b.encoding);
    expect(a.body.equals(b.body)).toBe(true);
  });
});
