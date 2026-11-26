// @cpt-algo:cpt-frontx-algo-studio-devtools-clamp-to-viewport:p1
// @cpt-algo:cpt-frontx-algo-studio-devtools-default-position:p1
// @cpt-algo:cpt-frontx-algo-studio-devtools-event-routing:p1
// @cpt-flow:cpt-frontx-flow-studio-devtools-drag-panel:p1
// @cpt-flow:cpt-frontx-flow-studio-devtools-drag-button:p1
// @cpt-flow:cpt-frontx-flow-studio-devtools-viewport-clamp:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-viewport-clamping:p1
// @cpt-state:cpt-frontx-state-studio-devtools-drag:p1
import { useState, useEffect, useRef, useCallback } from 'react';
import clamp from 'lodash/clamp';
import { eventBus } from '@gears-frontx/react';
import type { Position, Size } from '../types';
import { loadStudioState } from '../utils/persistence';
import { STORAGE_KEYS } from '../types';
import { StudioEvents } from '../events/studioEvents';

const VIEWPORT_MARGIN = 20;

// @cpt-begin:cpt-frontx-algo-studio-devtools-clamp-to-viewport:p1:inst-1
function clampToViewport(pos: Position, size: Size): Position {
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN);
  return {
    x: clamp(pos.x, VIEWPORT_MARGIN, maxX),
    y: clamp(pos.y, VIEWPORT_MARGIN, maxY),
  };
}
// @cpt-end:cpt-frontx-algo-studio-devtools-clamp-to-viewport:p1:inst-1

// Default position: bottom-right with margin, for the current window size.
function defaultPosition(size: Size): Position {
  return {
    x: window.innerWidth - size.width - VIEWPORT_MARGIN,
    y: window.innerHeight - size.height - VIEWPORT_MARGIN,
  };
}

interface UseDraggableProps {
  panelSize: Size;
  storageKey?: string;
}

// @cpt-begin:cpt-frontx-algo-studio-devtools-default-position:p1:inst-1
// @cpt-begin:cpt-frontx-algo-studio-devtools-event-routing:p1:inst-1
// @cpt-begin:cpt-frontx-flow-studio-devtools-drag-panel:p1:inst-1
// @cpt-begin:cpt-frontx-flow-studio-devtools-drag-button:p1:inst-1
// @cpt-begin:cpt-frontx-flow-studio-devtools-viewport-clamp:p1:inst-1
// @cpt-begin:cpt-frontx-state-studio-devtools-drag:p1:inst-1
export const useDraggable = ({ panelSize, storageKey = STORAGE_KEYS.POSITION }: UseDraggableProps) => {
  // The position the user chose by dragging, or null for the default corner.
  // A resize clamps only what is displayed; this preference changes only on a
  // drag, so the element returns to it once the window is large enough again.
  const [storedPosition] = useState(() => loadStudioState<Position | null>(storageKey, null));
  const preferred = useRef<Position | null>(storedPosition);
  const [position, setPosition] = useState<Position>(() =>
    clampToViewport(storedPosition ?? defaultPosition(panelSize), panelSize)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<Position>({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - panelSize.width - VIEWPORT_MARGIN);
      const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - panelSize.height - VIEWPORT_MARGIN);
      const newX = clamp(e.clientX - dragStartPos.current.x, VIEWPORT_MARGIN, maxX);
      const newY = clamp(e.clientY - dragStartPos.current.y, VIEWPORT_MARGIN, maxY);

      const newPosition = { x: newX, y: newY };
      preferred.current = newPosition;
      setPosition(newPosition);

      // Emit appropriate event based on storage key
      const eventName = storageKey === STORAGE_KEYS.BUTTON_POSITION
        ? StudioEvents.ButtonPositionChanged
        : StudioEvents.PositionChanged;
      eventBus.emit(eventName, { position: newPosition });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, panelSize.width, panelSize.height, storageKey]);

  useEffect(() => {
    // Display only: no position event, so the stored preference is untouched.
    const handleResize = () => {
      const next = clampToViewport(preferred.current ?? defaultPosition(panelSize), panelSize);
      setPosition((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panelSize.width, panelSize.height, panelSize]);

  return {
    position,
    isDragging,
    handleMouseDown,
  };
};
// @cpt-end:cpt-frontx-algo-studio-devtools-default-position:p1:inst-1
// @cpt-end:cpt-frontx-algo-studio-devtools-event-routing:p1:inst-1
// @cpt-end:cpt-frontx-flow-studio-devtools-drag-panel:p1:inst-1
// @cpt-end:cpt-frontx-flow-studio-devtools-drag-button:p1:inst-1
// @cpt-end:cpt-frontx-flow-studio-devtools-viewport-clamp:p1:inst-1
// @cpt-end:cpt-frontx-state-studio-devtools-drag:p1:inst-1
