import React, { useEffect, Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import DebugPanel from './components/DebugPanel';
import './styles/global.css';
import './styles/mobile.css';
// Removed PWA styles to avoid conflicts
// import './styles/pwa.css';
import './styles/login.css';
import './styles/home.css';
import './styles/lobby.css';
import './styles/game.css';
import './styles/gamepage.css';

// Lazy load pages for better performance
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const GamePage = React.lazy(() => import('./pages/GamePage'));
const GameTestPage = React.lazy(() => import('./pages/GameTestPage'));
const DebugResultsPage = React.lazy(() => import('./pages/DebugResultsPage'));
const DebugPlacementPage = React.lazy(() => import('./pages/DebugPlacementPage'));

function App() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
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

    // Cleanup on app unmount
    return () => {
      // Cleanup socket service when app unmounts
      import('./services/socketService').then(module => {
        module.socketService.cleanup();
      });
    };
  }, []);

  // Loading component for Suspense fallback
  const PageLoading = () => (
    <div className="loading-page" style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 16px' }}></div>
        <p>Laddar sida...</p>
      </div>
    </div>
  );

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

    return (
      <Suspense fallback={<PageLoading />}>
        {!isAuthenticated ? <Navigate to="/login" replace /> : children}
      </Suspense>
    );
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

    return (
      <Suspense fallback={<PageLoading />}>
        {children}
      </Suspense>
    );
  };
  return (
    <div className="app-container">
      <AuthProvider>
        <GameProvider>
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
              <Route 
                path="/debug/results" 
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <DebugResultsPage />
                  </Suspense>
                } 
              />
              <Route 
                path="/debug/placement" 
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <DebugPlacementPage />
                  </Suspense>
                } 
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </GameProvider>
      </AuthProvider>
      
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="offline-indicator">
          📱 Du är offline - Vissa funktioner är begränsade
        </div>
      )}
      
      {/* Debug Panel for Mobile Debugging */}
      <DebugPanel />
    </div>
  );
}

export default App;