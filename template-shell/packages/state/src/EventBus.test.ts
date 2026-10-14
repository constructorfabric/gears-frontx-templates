import { describe, expect, it, vi } from 'vitest';
import { EventBusImpl } from './EventBus';

type TestEventPayloadMap = {
  'test/valueChanged': { value: number };
  'test/once': { label: string };
};

describe('EventBusImpl', () => {
  it('delivers payloads to active subscribers', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { value: number }) => void>();

    bus.on('test/valueChanged', handler);
    bus.emit('test/valueChanged', { value: 7 });

    expect(handler).toHaveBeenCalledWith({ value: 7 });
  });

  it('stops delivering events after unsubscribe is called', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { value: number }) => void>();

    const subscription = bus.on('test/valueChanged', handler);
    subscription.unsubscribe();
    bus.emit('test/valueChanged', { value: 11 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes once handlers after the first event', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { label: string }) => void>();

    bus.once('test/once', handler);
    bus.emit('test/once', { label: 'first' });
    bus.emit('test/once', { label: 'second' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ label: 'first' });
  });

  it('runs every handler and logs instead of rethrowing when one throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const error = new Error('handler failed');
    const later = vi.fn<(payload: { value: number }) => void>();

    bus.on('test/valueChanged', () => {
      throw error;
    });
    bus.on('test/valueChanged', later);

    try {
      expect(() => {
        bus.emit('test/valueChanged', { value: 1 });
      }).not.toThrow();
      expect(later).toHaveBeenCalledWith({ value: 1 });
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('test/valueChanged'), error);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('removes a once handler that throws after its first event', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const handler = vi.fn<(payload: { label: string }) => void>(() => {
      throw new Error('once handler failed');
    });

    try {
      bus.once('test/once', handler);
      bus.emit('test/once', { label: 'first' });
      bus.emit('test/once', { label: 'second' });

      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('logs a rejection from an async subscriber and still runs the others', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const error = new Error('async handler failed');
    const later = vi.fn<(payload: { value: number }) => void>();

    bus.on('test/valueChanged', async () => {
      await Promise.resolve();
      throw error;
    });
    bus.on('test/valueChanged', later);

    try {
      expect(bus.emit('test/valueChanged', { value: 2 })).toBeUndefined();
      expect(later).toHaveBeenCalledWith({ value: 2 });
      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('test/valueChanged'), error);
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('logs a rejection from an async once handler and removes it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const error = new Error('async once handler failed');
    const handler = vi.fn<(payload: { label: string }) => Promise<void>>().mockRejectedValue(error);

    try {
      bus.once('test/once', handler);
      bus.emit('test/once', { label: 'first' });
      bus.emit('test/once', { label: 'second' });

      expect(handler).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('test/once'), error);
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('ignores emits when no subscribers are registered', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();

    expect(() => {
      bus.emit('test/valueChanged', { value: 5 });
    }).not.toThrow();
  });

  it('clears all handlers for a specific event', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const valueHandler = vi.fn<(payload: { value: number }) => void>();
    const onceHandler = vi.fn<(payload: { label: string }) => void>();

    bus.on('test/valueChanged', valueHandler);
    bus.on('test/once', onceHandler);

    bus.clear('test/valueChanged');
    bus.emit('test/valueChanged', { value: 3 });
    bus.emit('test/once', { label: 'still-active' });

    expect(valueHandler).not.toHaveBeenCalled();
    expect(onceHandler).toHaveBeenCalledWith({ label: 'still-active' });
  });

  it('clears every registered handler', () => {
    const bus = new EventBusImpl<TestEventPayloadMap>();
    const valueHandler = vi.fn<(payload: { value: number }) => void>();
    const onceHandler = vi.fn<(payload: { label: string }) => void>();

    bus.on('test/valueChanged', valueHandler);
    bus.on('test/once', onceHandler);

    bus.clearAll();
    bus.emit('test/valueChanged', { value: 8 });
    bus.emit('test/once', { label: 'cleared' });

    expect(valueHandler).not.toHaveBeenCalled();
    expect(onceHandler).not.toHaveBeenCalled();
  });
});
