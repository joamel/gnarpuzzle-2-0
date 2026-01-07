import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../assets/Logo';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Användarnamn krävs');
      return;
    }

    if (username.length < 2) {
      setError('Användarnamn måste vara minst 2 tecken');
      return;
    }

    try {
      await login(username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inloggning misslyckades');
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <Logo size="medium" showText={true} />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Användarnamn</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ange ditt användarnamn"
              disabled={isLoading}
              maxLength={20}
              autoComplete="username"
              autoFocus
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading || !username.trim()}
          >
            {isLoading ? 'Loggar in...' : 'Börja spela'}
          </button>
        </form>

        <div className="login-info">
          <p>Inget konto behövs - bara ett användarnamn!</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;