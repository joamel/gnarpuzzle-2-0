import React, { useState, useRef, useCallback, useEffect } from 'react';
import '../styles/brick.css';
import '../styles/draggable-brick.css';

interface DraggableBrickProps {
  letter: string;
  onClick?: () => void;
  onDragStart?: (letter: string, startCell?: { x: number; y: number }) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onDragCancel?: () => void;
  // Letter browsing mode (for selection phase)
  onLetterHover?: (letter: string) => void;
  onLetterSelect?: (letter: string) => void;
  mode?: 'placement' | 'selection';
  disabled?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  variant?: 'board' | 'button';
  className?: string;
  dataCellKey?: string;
  // When provided, enables placement-drag even if the visible brick is empty (e.g. long-press on an empty board cell).
  dragLetter?: string;
}

const DraggableBrick: React.FC<DraggableBrickProps> = ({
  letter,
  onClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  onLetterHover,
  onLetterSelect,
  mode = 'placement',
  disabled = false,
  isSelected = false,
  isHovered = false,
  variant = 'board',
  className = '',
  dataCellKey,
  dragLetter
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDragStartedRef = useRef(false);
  const initialTouchRef = useRef({ x: 0, y: 0 });
  const lastHoveredLetterRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const elementRef = useRef<HTMLButtonElement | null>(null);
  const lastValidCellRef = useRef<{ cell: { x: number; y: number }; atMs: number; coords: { x: number; y: number } } | null>(null);

  const effectiveDragLetter = dragLetter ?? letter;

  const parseCellKey = useCallback(() => {
    if (!dataCellKey) return null;
    const [x, y] = dataCellKey.split('-').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }, [dataCellKey]);

  const baseClass = variant === 'board' ? 'brick brick-board' : 'brick brick-button';
  const selectedClass = isSelected ? 'selected' : '';
  const hoveredClass = isHovered ? 'hovered' : '';
  const disabledClass = disabled ? 'disabled' : '';
  const filledClass = letter ? 'filled' : '';
  const draggingClass = isDragging ? 'dragging' : '';
  const pressingClass = isPressing ? 'pressing' : '';
  const browsingClass = (mode === 'selection' && (isDragging || isHovered)) ? 'browsing' : '';

  // Setup non-passive touch events to allow preventDefault
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchMoveNative = (e: TouchEvent) => {
      if (mode === 'placement' && (isDragging || isPressing)) {
        // Prevent scrolling during placement interaction (drag or press).
        // Must be done in a non-passive listener to avoid console warnings.
        if (e.cancelable) e.preventDefault();
      }
    };

    // Add non-passive touchmove listener
    element.addEventListener('touchmove', handleTouchMoveNative, { passive: false });

    return () => {
      element.removeEventListener('touchmove', handleTouchMoveNative);
    };
  }, [isDragging, isPressing, mode]);

  // Helper to get coordinates relative to viewport
  const getEventCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  // Find the board cell under coordinates
  const getBoardCellFromElement = (element: Element | null) => {
    let current: HTMLElement | null = element as HTMLElement | null;
    while (current) {
      if (current.classList?.contains('brick-board')) {
        const key = current.getAttribute('data-cell-key');
        if (!key) return null;
        const [cellX, cellY] = key.split('-').map(Number);
        if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) return null;
        return { x: cellX, y: cellY };
      }
      current = current.parentElement;
    }
    return null;
  };

  const findCellUnderCoordinates = (x: number, y: number) => {
    return getBoardCellFromElement(document.elementFromPoint(x, y));
  };

  // More forgiving: if the pointer is slightly between cells, probe nearby points.
  const findCellNearCoordinates = (x: number, y: number) => {
    const direct = findCellUnderCoordinates(x, y);
    if (direct) return direct;

    const r = 18;
    const offsets = [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
      [r, r],
      [r, -r],
      [-r, r],
      [-r, -r],
      [2 * r, 0],
      [-2 * r, 0],
      [0, 2 * r],
      [0, -2 * r]
    ] as const;

    for (const [dx, dy] of offsets) {
      const cell = findCellUnderCoordinates(x + dx, y + dy);
      if (cell) return cell;
    }

    return null;
  };

  // Find letter under coordinates (for selection browsing)
  const findLetterUnderCoordinates = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    if (element?.classList.contains('brick-button')) {
      const letterElement = element as HTMLElement;
      const letter = letterElement.getAttribute('data-letter');
      return letter;
    }
    return null;
  };

  const updateHoveredLetter = useCallback((x: number, y: number) => {
    const hoveredLetter = findLetterUnderCoordinates(x, y);
    if (hoveredLetter) {
      lastHoveredLetterRef.current = hoveredLetter;
      onLetterHover?.(hoveredLetter);
    }
  }, [onLetterHover]);

  const startLongPress = useCallback((coords: { x: number, y: number }) => {
    if (disabled) return;

    // For placement dragging, allow initiating drag as long as we have a letter to drag.
    // This supports long-pressing an empty board cell to start placement.
    if (mode === 'placement' && !effectiveDragLetter) return;

    // For selection browsing, still require an actual letter.
    if (mode === 'selection' && !letter) return;

    // Different behavior for different modes - optimized for mobile
    if (mode === 'selection' && variant === 'button') {
      // In selection mode, just enable browsing - no dragging away from position
      longPressTimeoutRef.current = setTimeout(() => {
        // Haptic feedback for mobile
        if (navigator.vibrate) {
          navigator.vibrate([30, 10, 30]); // Double vibration for browsing mode
        }
        
        setIsDragging(true);
        isDragStartedRef.current = true;
        suppressClickRef.current = true;
        initialTouchRef.current = coords;
        // Keep position at original location for browsing
        setDragPosition(coords);
        
        // Signal browsing mode start
        onLetterHover?.(letter);
      }, 150); // Faster for mobile browsing
    } else if (mode === 'placement' && (variant === 'button' || variant === 'board')) {
      // In placement mode, drag to place on board.
      // For board-variant this is used for dragging an already-temporary placed letter.
      longPressTimeoutRef.current = setTimeout(() => {
        // Strong haptic feedback for placement drag
        if (navigator.vibrate) {
          navigator.vibrate([50, 20, 100]);
        }

        setIsDragging(true);
        isDragStartedRef.current = true;
        suppressClickRef.current = true;
        initialTouchRef.current = coords;
        setDragPosition(coords);

        const startCell = variant === 'board' ? parseCellKey() : null;
        onDragStart?.(effectiveDragLetter, startCell ?? undefined);

        // If we're starting on a board cell, preview immediately from that cell.
        if (startCell) {
          lastValidCellRef.current = { cell: startCell, atMs: Date.now(), coords };
          onDragMove?.(startCell.x, startCell.y);
        }
      }, 250);
    }
  }, [disabled, mode, variant, letter, effectiveDragLetter, onDragStart, onDragMove, onLetterHover, parseCellKey]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsPressing(true);
    const coords = getEventCoordinates(e);
    initialTouchRef.current = coords;
    lastHoveredLetterRef.current = null;
    startLongPress(coords);
  }, [startLongPress, mode, variant, letter, disabled]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    if (disabled) return;

    const coords = getEventCoordinates(e);
    initialTouchRef.current = coords;
    lastHoveredLetterRef.current = null;

    // Desktop: start drag/browse immediately (no long-press).
    if (variant === 'button') {
      if (mode === 'selection') {
        setIsDragging(true);
        isDragStartedRef.current = true;
        suppressClickRef.current = true;
        setDragPosition(coords);
        updateHoveredLetter(coords.x, coords.y);
        return;
      }
      if (mode === 'placement') {
        if (!effectiveDragLetter) return;
        setIsDragging(true);
        isDragStartedRef.current = true;
        suppressClickRef.current = true;
        setDragPosition(coords);
        onDragStart?.(effectiveDragLetter);
        return;
      }
    }

    // Board-variant placement: allow immediate drag on desktop too (used for moving temporary placement).
    if (variant === 'board' && mode === 'placement' && letter) {
      setIsDragging(true);
      isDragStartedRef.current = true;
      suppressClickRef.current = true;
      setDragPosition(coords);
      onDragStart?.(letter, parseCellKey() ?? undefined);
      return;
    }

    startLongPress(coords);
  }, [disabled, effectiveDragLetter, getEventCoordinates, letter, mode, onDragStart, parseCellKey, startLongPress, updateHoveredLetter, variant]);

  const handleMove = useCallback((coords: { x: number, y: number }) => {
    if (!isDragStartedRef.current) {
      // If we're not dragging yet, check if we moved too far (cancel long press)
      // More sensitive threshold for mobile
      const deltaX = Math.abs(coords.x - initialTouchRef.current.x);
      const deltaY = Math.abs(coords.y - initialTouchRef.current.y);
      if (mode !== 'selection') {
        if (deltaX > 8 || deltaY > 8) {
          cancelLongPress();
        }
      }

      // For selection mode, allow immediate browsing even before longpress timeout
      if (mode === 'selection') {
        updateHoveredLetter(coords.x, coords.y);
      }
      
      return;
    }

    if (isDragging) {
      if (mode === 'selection') {
        // In selection mode, don't update drag position - just browse letters
        updateHoveredLetter(coords.x, coords.y);
      } else if (mode === 'placement') {
        // In placement mode, update position and show letter following cursor
        setDragPosition(coords);
        const cell = findCellNearCoordinates(coords.x, coords.y);
        if (cell) {
          lastValidCellRef.current = { cell, atMs: Date.now(), coords };
          onDragMove?.(cell.x, cell.y);
        }
      }
    }
  }, [isDragging, cancelLongPress, mode, onDragMove, updateHoveredLetter]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const coords = getEventCoordinates(e);
    handleMove(coords);
  }, [handleMove, isDragging, mode, isPressing]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getEventCoordinates(e);
    handleMove(coords);
  }, [handleMove]);

  const handleEnd = useCallback((coords: { x: number, y: number }) => {
    setIsPressing(false);
    cancelLongPress();

    if (isDragStartedRef.current && isDragging) {
      if (mode === 'selection') {
        // For letter browsing, we just update selection without placing
        const hoveredLetter = findLetterUnderCoordinates(coords.x, coords.y) || lastHoveredLetterRef.current;
        if (hoveredLetter) {
          onLetterSelect?.(hoveredLetter);
        }
      } else if (mode === 'placement') {
        // For placement mode, actually place the brick on a cell
        let cell = findCellNearCoordinates(coords.x, coords.y);

        // If we recently hovered a valid cell but released slightly outside it,
        // snap to that last valid cell instead of cancelling.
        if (!cell && lastValidCellRef.current) {
          const { cell: lastCell, atMs, coords: lastCoords } = lastValidCellRef.current;
          const ageMs = Date.now() - atMs;
          const dx = coords.x - lastCoords.x;
          const dy = coords.y - lastCoords.y;
          const dist = Math.hypot(dx, dy);

          if (ageMs <= 250 && dist <= 60) {
            cell = lastCell;
          }
        }

        if (cell) onDragEnd?.(cell.x, cell.y);
        else onDragCancel?.();
      }
      
      setIsDragging(false);
      isDragStartedRef.current = false;
      setDragPosition({ x: 0, y: 0 });
      lastHoveredLetterRef.current = null;
      lastValidCellRef.current = null;

      // Suppress the synthetic click that happens after mouseup/touchend.
      // Clear on next tick so future taps still work.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    } else if (!isDragStartedRef.current) {
      // Selection sweep without long-press: if we hovered something, pick it.
      if (mode === 'selection' && lastHoveredLetterRef.current) {
        onLetterSelect?.(lastHoveredLetterRef.current);
        lastHoveredLetterRef.current = null;
        return;
      }
      // This was a regular tap/click, not a drag
      onClick?.();
    }
  }, [isDragging, cancelLongPress, mode, onDragEnd, onDragCancel, onLetterSelect, onClick]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const coords = getEventCoordinates(e);
    handleEnd(coords);
  }, [handleEnd, isDragging, mode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const coords = getEventCoordinates(e);
    handleEnd(coords);
  }, [handleEnd]);

  // Global mouse move/up handlers for when dragging outside the element
  React.useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMove({ x: e.clientX, y: e.clientY });
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      handleEnd({ x: e.clientX, y: e.clientY });
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        if (e.cancelable) e.preventDefault(); // Always prevent scroll during drag
        e.stopPropagation(); // Prevent event bubbling
        handleMove({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches[0]) {
        if (e.cancelable) e.preventDefault(); // Prevent ghost clicks (when allowed)
        handleEnd({ x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  const dragStyle = isDragging ? {
    position: 'fixed' as const,
    left: dragPosition.x - 25, // Center the brick on cursor
    top: dragPosition.y - 25,
    zIndex: 1000,
    pointerEvents: 'none' as const,
    transform: 'scale(1.1)',
  } : {};

  // UX: when dragging from the letter selector (button), hide the origin letter so it doesn't appear twice.
  // When dragging on the board (board), keep the letter visible so long-press “places/previews” immediately.
  const shouldHideLetterInButton = isDragging && mode === 'placement' && variant === 'button';

  return (
    <>
      <button
        ref={elementRef}
        className={`${baseClass} ${selectedClass} ${disabledClass} ${filledClass} ${draggingClass} ${pressingClass} ${hoveredClass} ${browsingClass} ${className || ''}`}
        onClick={() => {
          if (suppressClickRef.current) return;
          onClick?.();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        disabled={disabled}
        data-letter={letter}
        data-mode={mode}
        data-cell-key={dataCellKey}
        style={isDragging && mode === 'placement' ? { opacity: 0.5 } : {}}
      >
        {shouldHideLetterInButton ? '' : letter}
      </button>
      
      {/* Dragging ghost element - only show for placement mode */}
      {isDragging && mode === 'placement' && (
        <div
          className={`${baseClass} ${filledClass} dragging-ghost`}
          style={dragStyle}
        >
          {effectiveDragLetter}
        </div>
      )}
    </>
  );
};

export default DraggableBrick;