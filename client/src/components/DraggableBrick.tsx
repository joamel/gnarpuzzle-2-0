import React, { useState, useRef, useCallback, useEffect } from 'react';
import '../styles/brick.css';
import '../styles/draggable-brick.css';

interface DraggableBrickProps {
  letter: string;
  onClick?: () => void;
  onDragStart?: (letter: string) => void;
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
  className = ''
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
      if (isDragging) {
        e.preventDefault(); // Prevent scrolling during drag
      }
    };

    // Add non-passive touchmove listener
    element.addEventListener('touchmove', handleTouchMoveNative, { passive: false });

    return () => {
      element.removeEventListener('touchmove', handleTouchMoveNative);
    };
  }, [isDragging]);

  // Helper to get coordinates relative to viewport
  const getEventCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  // Find the board cell under coordinates
  const findCellUnderCoordinates = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    console.log('🔧 findCellUnderCoordinates:', { x, y, element: element?.className, tagName: element?.tagName });
    if (element?.classList.contains('brick-board')) {
      const cellElement = element as HTMLElement;
      const key = cellElement.getAttribute('data-cell-key');
      if (key) {
        const [cellX, cellY] = key.split('-').map(Number);
        console.log('🔧 Found board cell:', { cellX, cellY, key });
        return { x: cellX, y: cellY };
      }
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
    } else if (mode === 'placement' && variant === 'button') {
      // In placement mode, drag to place on board
      console.log('🚀 Starting placement longpress for letter:', letter);
      longPressTimeoutRef.current = setTimeout(() => {
        console.log('🚀 Placement longpress triggered for letter:', letter);
        // Strong haptic feedback for placement drag
        if (navigator.vibrate) {
          navigator.vibrate([50, 20, 100]); // Strong pattern for drag start
        }
        
        setIsDragging(true);
        isDragStartedRef.current = true;
        suppressClickRef.current = true;
        initialTouchRef.current = coords;
        setDragPosition(coords);
        
        console.log('🚀 Calling onDragStart with letter:', letter);
        onDragStart?.(letter);
      }, 250); // Faster for mobile placement
    }
  }, [disabled, mode, variant, letter, onDragStart, onLetterHover]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    console.log('🔧 DraggableBrick touch start:', { mode, variant, letter, disabled });
    e.preventDefault(); // Prevent default touch behaviors
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
        setIsDragging(true);
        isDragStartedRef.current = true;
        suppressClickRef.current = true;
        setDragPosition(coords);
        onDragStart?.(letter);
        return;
      }
    }

    startLongPress(coords);
  }, [disabled, getEventCoordinates, letter, mode, onDragStart, startLongPress, updateHoveredLetter, variant]);

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
        const cell = findCellUnderCoordinates(coords.x, coords.y);
        console.log('🎯 Placement drag move to coords:', coords, 'found cell:', cell);
        if (cell) {
          onDragMove?.(cell.x, cell.y);
        }
      }
    }
  }, [isDragging, cancelLongPress, mode, onDragMove, updateHoveredLetter]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Always prevent default for touch move during placement
    if (mode === 'placement' && (isDragging || isPressing)) {
      e.preventDefault();
    }
    const coords = getEventCoordinates(e);
    console.log('🔧 DraggableBrick touch move:', { isDragging, mode, coords });
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
        const cell = findCellUnderCoordinates(coords.x, coords.y);
        
        if (cell) {
          onDragEnd?.(cell.x, cell.y);
        } else {
          onDragCancel?.();
        }
      }
      
      setIsDragging(false);
      isDragStartedRef.current = false;
      setDragPosition({ x: 0, y: 0 });
      lastHoveredLetterRef.current = null;

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
    console.log('🔧 DraggableBrick touch end:', { isDragging, mode });
    e.preventDefault(); // Prevent ghost clicks
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
        e.preventDefault(); // Always prevent scroll during drag
        e.stopPropagation(); // Prevent event bubbling
        handleMove({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches[0]) {
        e.preventDefault(); // Prevent ghost clicks
        handleEnd({ x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY });
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd);

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
        style={isDragging && mode === 'placement' ? { opacity: 0.5 } : {}}
      >
        {isDragging && mode === 'placement' ? '' : letter}
      </button>
      
      {/* Dragging ghost element - only show for placement mode */}
      {isDragging && mode === 'placement' && (
        <div
          className={`${baseClass} ${filledClass} dragging-ghost`}
          style={dragStyle}
        >
          {letter}
        </div>
      )}
    </>
  );
};

export default DraggableBrick;