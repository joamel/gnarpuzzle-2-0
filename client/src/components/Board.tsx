import React from 'react';
import '../styles/board.css';

export interface GridCell {
  letter?: string;
  playerId?: string;
}

export interface BoardProps {
  grid: GridCell[][];
  boardSize?: number;
  onCellClick?: (x: number, y: number) => void;
  getCellClassName?: (cell: GridCell, x: number, y: number) => string;
  showCoordinates?: boolean;
}

const Board: React.FC<BoardProps> = ({
  grid,
  boardSize = 5,
  onCellClick,
  getCellClassName,
  showCoordinates = false
}) => {
  if (!grid || grid.length === 0) {
    return (
      <div className="empty-board-message">
        <p>Ingen bräde tillgänglig</p>
      </div>
    );
  }

  return (
    <div className="board" style={{ '--grid-size': grid.length || boardSize } as React.CSSProperties}>
      {grid.map((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${x}-${y}`}
            className={getCellClassName ? getCellClassName(cell, x, y) : 'board-cell'}
            onClick={() => onCellClick?.(x, y)}
          >
            <span className="cell-letter">
              {cell.letter || ''}
            </span>
            {showCoordinates && (
              <div className="cell-coords">{x},{y}</div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default Board;
