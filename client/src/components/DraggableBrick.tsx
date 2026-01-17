import React, { useState, useRef, useCallback } from 'react';
import '../styles/brick.css';
import '../styles/draggable-brick.css';

interface DraggableBrickProps {
  letter: string;
  onClick?: () => void;
  onDragStart?: (letter: string) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onDragCancel?: () => void;
  disabled?: boolean;
  isSelected?: boolean;
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
  disabled = false,
  isSelected = false,
  variant = 'board',
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDragStartedRef = useRef(false);
  const initialTouchRef = useRef({ x: 0, y: 0 });
  const elementRef = useRef<HTMLButtonElement | null>(null);

  const baseClass = variant === 'board' ? 'brick brick-board' : 'brick brick-button';
  const selectedClass = isSelected ? 'selected' : '';
  const disabledClass = disabled ? 'disabled' : '';
  const filledClass = letter ? 'filled' : '';
  const draggingClass = isDragging ? 'dragging' : '';

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
    if (element?.classList.contains('brick-board')) {
      const cellElement = element as HTMLElement;
      const key = cellElement.getAttribute('data-cell-key');
      if (key) {
        const [cellX, cellY] = key.split('-').map(Number);
        return { x: cellX, y: cellY };
      }
    }
    return null;
  };

  const startLongPress = useCallback((coords: { x: number, y: number }) => {
    if (disabled || variant !== 'button') return;

    longPressTimeoutRef.current = setTimeout(() => {
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      setIsDragging(true);
      isDragStartedRef.current = true;
      initialTouchRef.current = coords;
      setDragPosition(coords);
      
      onDragStart?.(letter);
    }, 350); // 350ms for long press
  }, [disabled, variant, letter, onDragStart]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const coords = getEventCoordinates(e);
    startLongPress(coords);
  }, [startLongPress]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    
    const coords = getEventCoordinates(e);
    startLongPress(coords);
  }, [startLongPress]);

  const handleMove = useCallback((coords: { x: number, y: number }) => {
    if (!isDragStartedRef.current) {
      // If we're not dragging yet, check if we moved too far (cancel long press)
      const deltaX = Math.abs(coords.x - initialTouchRef.current.x);
      const deltaY = Math.abs(coords.y - initialTouchRef.current.y);
      if (deltaX > 10 || deltaY > 10) {
        cancelLongPress();
      }
      return;
    }

    if (isDragging) {
      setDragPosition(coords);
      
      // Find cell under cursor
      const cell = findCellUnderCoordinates(coords.x, coords.y);
      if (cell) {
        onDragMove?.(cell.x, cell.y);
      }
    }
  }, [isDragging, cancelLongPress, onDragMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling while dragging
    const coords = getEventCoordinates(e);
    handleMove(coords);
  }, [handleMove]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getEventCoordinates(e);
    handleMove(coords);
  }, [handleMove]);

  const handleEnd = useCallback((coords: { x: number, y: number }) => {
    cancelLongPress();

    if (isDragStartedRef.current && isDragging) {
      // Find final cell position
      const cell = findCellUnderCoordinates(coords.x, coords.y);
      
      if (cell) {
        onDragEnd?.(cell.x, cell.y);
      } else {
        onDragCancel?.();
      }
      
      setIsDragging(false);
      isDragStartedRef.current = false;
      setDragPosition({ x: 0, y: 0 });
    } else if (!isDragStartedRef.current) {
      // This was a regular tap/click, not a drag
      onClick?.();
    }
  }, [isDragging, cancelLongPress, onDragEnd, onDragCancel, onClick]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const coords = getEventCoordinates(e);
    handleEnd(coords);
  }, [handleEnd]);

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

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
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
        className={`${baseClass} ${selectedClass} ${disabledClass} ${filledClass} ${draggingClass} ${className}`}
        onClick={isDragStartedRef.current ? undefined : onClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        disabled={disabled}
        data-letter={letter}
        style={isDragging ? { opacity: 0.5 } : {}}
      >
        {isDragging ? '' : letter}
      </button>
      
      {/* Dragging ghost element */}
      {isDragging && (
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