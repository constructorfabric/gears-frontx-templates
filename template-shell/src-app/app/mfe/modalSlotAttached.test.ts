/**
 * The modal slot's attachment signal. A sender that dispatches `mount_ext`
 * into the popup domain waits for it, so it has to resolve on the next attach,
 * including when a detach arrives before that attach ever happened. The signal
 * is module state, so every case imports a fresh copy of the module.
 */
import { describe, expect, it, vi } from 'vitest';

async function freshSignal() {
  vi.resetModules();
  return import('./modalSlotAttached');
}

describe('the modal slot attachment signal', () => {
  it('resolves a caller that waits for the attach', async () => {
    const signal = await freshSignal();

    signal.markModalSlotAttached();

    await expect(signal.modalSlotAttached()).resolves.toBeUndefined();
  });

  it('keeps a pending caller waiting when a detach arrives before the first attach', async () => {
    const signal = await freshSignal();
    const waiting = signal.modalSlotAttached();
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });

    signal.markModalSlotDetached();
    signal.markModalSlotAttached();
    await Promise.resolve();

    expect(settled).toBe(true);
  });

  it('waits for the next attach after a detach', async () => {
    const signal = await freshSignal();
    signal.markModalSlotAttached();
    await signal.modalSlotAttached();

    signal.markModalSlotDetached();
    let settled = false;
    const waiting = signal.modalSlotAttached().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    signal.markModalSlotAttached();
    await waiting;
    expect(settled).toBe(true);
  });
});
