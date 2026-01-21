import React from 'react';
import './Logo.css';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  showTagline?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 'medium', showText = true, showTagline = false }) => {
  const sizeClasses = {
    small: 'logo-small',
    medium: 'logo-medium',
    large: 'logo-large'
  };

  return (
    <div className={`gnarp-logo ${sizeClasses[size]}${showText ? '' : ' logo-icon-only'}`}>
      <div className="logo-container">
        {/* Puzzle piece SVG */}
        <svg 
          viewBox="0 0 100 100" 
          className="puzzle-icon"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="puzzleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#667eea" />
              <stop offset="50%" stopColor="#f4a261" />
              <stop offset="100%" stopColor="#19547b" />
            </linearGradient>
            <linearGradient id="pieceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffd89b" />
              <stop offset="100%" stopColor="#f4a261" />
            </linearGradient>
          </defs>
          
          {/* Main puzzle piece */}
          <path
            d="M20 20 
               L50 20
               C55 20 60 25 60 30
               C60 35 55 40 50 40
               L50 50
               C50 55 45 60 40 60
               C35 60 30 55 30 50
               L30 40
               L20 40
               Z"
            fill="url(#puzzleGradient)"
            className="puzzle-piece main-piece"
          />
          
          {/* Connecting piece */}
          <path
            d="M60 30
               L80 30
               L80 50
               C80 55 75 60 70 60
               C65 60 60 55 60 50
               Z"
            fill="url(#pieceGradient)"
            className="puzzle-piece connector-piece"
          />
          
          {/* Small accent pieces */}
          <circle cx="75" cy="20" r="5" fill="url(#puzzleGradient)" opacity="0.7" className="accent-piece" />
          <circle cx="25" cy="75" r="4" fill="url(#pieceGradient)" opacity="0.8" className="accent-piece" />
          <circle cx="85" cy="75" r="3" fill="url(#puzzleGradient)" opacity="0.6" className="accent-piece" />
        </svg>
        
        {showText && (
          <div className="logo-text">
            <span className="brand-name">
              <span className="gnarp">GnarP</span>
              <span className="puzzle">uzzle</span>
            </span>
            {showTagline && <span className="tagline">Ordjakten börjar här</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default Logo;
