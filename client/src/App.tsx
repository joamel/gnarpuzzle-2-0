import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import GameTestPage from './pages/GameTestPage';
import './styles/global.css';
import './styles/mobile.css';
// Removed PWA styles to avoid conflicts
// import './styles/pwa.css';
import './styles/login.css';
import './styles/home.css';
import './styles/lobby.css';
import './styles/game.css';
import './styles/gamepage.css';

function App() {
  // Unregister any existing Service Workers in development
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          console.log('Unregistering Service Worker:', registration.scope);
          registration.unregister();
        }
      });
    }
  }, []);

  // Protected route component - moved inside App to have access to AuthProvider
  const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="loading-page" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px' }}></div>
            <p>Laddar GnarPuzzle...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }

    return <GameProvider>{children}</GameProvider>;
  };

  // Public route component - moved inside App to have access to AuthProvider
  const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="loading-page" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px' }}></div>
            <p>Laddar GnarPuzzle...</p>
          </div>
        </div>
      );
    }

    if (isAuthenticated) {
      return <Navigate to="/" replace />;
    }

    return <>{children}</>;
  };
  return (
    <div className="app-container">
      <AuthProvider>
        <Router future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}>
          <Routes>
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              } 
            />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/game" 
              element={
                <ProtectedRoute>
                  <GamePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/test" 
              element={
                <div style={{ isolation: 'isolate' }}>
                  <GameTestPage />
                </div>
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
      
      {/* Offline Indicator */}
      <div className="offline-indicator">
        📱 Du är offline - Vissa funktioner är begränsade
      </div>
    </div>
  );
}

export default App;