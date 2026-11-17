import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '@gears-frontx/react';
import { StudioEvents } from '../events/studioEvents';
import { STORAGE_KEYS } from '../types';
import { useDraggable } from './useDraggable';

vi.mock('@gears-frontx/react', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe('useDraggable', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(globalThis, 'innerHeight', { value: 900, configurable: true });
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the stored position and clamps it to the viewport', () => {
    localStorage.setItem(STORAGE_KEYS.POSITION, JSON.stringify({ x: 4000, y: -50 }));

    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 400, height: 300 },
      })
    );

    expect(result.current.position).toEqual({ x: 780, y: 20 });
  });

  it('emits position changes while dragging the panel', () => {
    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 400, height: 300 },
      })
    );

    act(() => {
      result.current.handleMouseDown({ clientX: 790, clientY: 590 } as React.MouseEvent);
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 620, clientY: 440 }));
    });

    expect(result.current.position).toEqual({ x: 610, y: 430 });
    expect(eventBus.emit).toHaveBeenCalledWith(StudioEvents.PositionChanged, {
      position: { x: 610, y: 430 },
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('routes collapsed button drags through the button position event', () => {
    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 48, height: 48 },
        storageKey: STORAGE_KEYS.BUTTON_POSITION,
      })
    );

    act(() => {
      result.current.handleMouseDown({ clientX: 1140, clientY: 840 } as React.MouseEvent);
    });

    act(() => {
      globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 868, clientY: 568 }));
    });

    expect(eventBus.emit).toHaveBeenCalledWith(StudioEvents.ButtonPositionChanged, {
      position: { x: 860, y: 560 },
    });
  });

  const resizeTo = (width: number, height: number) => {
    Object.defineProperty(globalThis, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(globalThis, 'innerHeight', { value: height, configurable: true });
    act(() => {
      globalThis.dispatchEvent(new Event('resize'));
    });
  };

  it('re-clamps the displayed position when the viewport shrinks, without writing it', () => {
    localStorage.setItem(STORAGE_KEYS.POSITION, JSON.stringify({ x: 760, y: 560 }));

    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 400, height: 300 },
      })
    );

    resizeTo(700, 500);

    expect(result.current.position).toEqual({ x: 280, y: 180 });
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.POSITION)).toBe(JSON.stringify({ x: 760, y: 560 }));
  });

  it('returns the button to its saved position when the window grows again', () => {
    localStorage.setItem(STORAGE_KEYS.BUTTON_POSITION, JSON.stringify({ x: 600, y: 400 }));

    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 48, height: 48 },
        storageKey: STORAGE_KEYS.BUTTON_POSITION,
      })
    );

    resizeTo(80, 80);
    expect(result.current.position).toEqual({ x: 20, y: 20 });

    resizeTo(1200, 900);
    expect(result.current.position).toEqual({ x: 600, y: 400 });
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.BUTTON_POSITION)).toBe(JSON.stringify({ x: 600, y: 400 }));
  });

  it('keeps the default bottom-right corner across a shrink and a grow, storing nothing', () => {
    const { result } = renderHook(() =>
      useDraggable({
        panelSize: { width: 48, height: 48 },
        storageKey: STORAGE_KEYS.BUTTON_POSITION,
      })
    );
    expect(result.current.position).toEqual({ x: 1132, y: 832 });

    resizeTo(80, 80);
    expect(result.current.position).toEqual({ x: 20, y: 20 });

    resizeTo(390, 844);
    expect(result.current.position).toEqual({ x: 322, y: 776 });
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.BUTTON_POSITION)).toBeNull();
  });
});
