import React from 'react';
import '../styles/brick.css';

interface BrickProps {
  letter: string;
  onClick?: () => void;
  disabled?: boolean;
  isSelected?: boolean;
  variant?: 'board' | 'button';
  className?: string;
}

const Brick: React.FC<BrickProps> = ({
  letter,
  onClick,
  disabled = false,
  isSelected = false,
  variant = 'board',
  className = ''
}) => {
  const baseClass = variant === 'board' ? 'brick brick-board' : 'brick brick-button';
  const selectedClass = isSelected ? 'selected' : '';
  const disabledClass = disabled ? 'disabled' : '';
  const filledClass = letter ? 'filled' : '';
  
  return (
    <button
      className={`${baseClass} ${selectedClass} ${disabledClass} ${filledClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {letter}
    </button>
  );
};

export default Brick;
