import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../assets/Logo';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const { login, loginAsGuest, isLoading } = useAuth();

  const makeGuestUsername = () => {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    // Keep it simple and compatible with server username regex.
    return `gast_${suffix}`;
  };

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

    if (password.length < 8) {
      setError('Lösenord måste vara minst 8 tecken');
      return;
    }

    if (mode === 'register') {
      if (!confirmPassword) {
        setError('Bekräfta lösenordet');
        return;
      }
      if (password !== confirmPassword) {
        setError('Lösenorden matchar inte');
        return;
      }
    }

    try {
      // For now, reuse login() for both modes by choosing endpoint server-side.
      // Registration is handled by a direct API call in AuthContext in future; keep simple here.
      if (mode === 'register') {
        // We don't have register in context; do it via apiService then set state.
        // To keep AuthContext the single source of truth, do a login after register.
        const { apiService } = await import('../services/apiService');
        await apiService.register(username.trim(), password);
      }
      await login(username.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      const lower = msg.toLowerCase();
      if (lower.includes('invalid credentials')) {
        setError('Fel användarnamn eller lösenord');
        return;
      }
      if (lower.includes('password required') || lower.includes('protected')) {
        setError('Det här användarnamnet är skyddat. Logga in med lösenord istället.');
        return;
      }
      if (lower.includes('invalid username')) {
        setError('Ogiltigt användarnamn');
        return;
      }
      setError(msg || 'Inloggning misslyckades');
    }
  };

  const handleGuestLogin = async () => {
    setError('');

    // Guest login should not depend on what's typed in the login inputs.
    // Always generate a fresh guest username.
    const desired = makeGuestUsername();
    try {
      // Show the generated name in the input so users understand who they are.
      setUsername(desired);
      await loginAsGuest(desired);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      const lower = msg.toLowerCase();
      if (lower.includes('password required') || lower.includes('protected')) {
        // Should be extremely rare now since we always generate a guest username,
        // but keep a helpful message.
        setError('Det gick inte att logga in som gäst. Försök igen.');
        return;
      }
      if (lower.includes('invalid username')) {
        setError('Ogiltigt användarnamn. Använd 2–20 tecken och bara bokstäver, siffror, _ samt å/ä/ö.');
        return;
      }
      setError(msg || 'Gästinloggning misslyckades');
    }
  };

  return (
    <div className="login-page">
      <header className="page-header login-header-bar">
        <Logo size="medium" showText={true} showTagline={true} />
      </header>
      <div className="login-container">
        <form onSubmit={handleSubmit} className="login-form">
          <div className="auth-mode-tabs" aria-label="Välj läge">
            <label className="auth-mode-tab">
              <input
                type="radio"
                name="auth-mode"
                checked={mode === 'login'}
                onChange={() => {
                  setMode('login');
                  setConfirmPassword('');
                }}
                disabled={isLoading}
              />
              <span>Logga in</span>
            </label>
            <label className="auth-mode-tab">
              <input
                type="radio"
                name="auth-mode"
                checked={mode === 'register'}
                onChange={() => setMode('register')}
                disabled={isLoading}
              />
              <span>Skapa konto</span>
            </label>
          </div>

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

          <div className="form-group">
            <label htmlFor="password">Lösenord</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ange ditt lösenord"
              disabled={isLoading}
              maxLength={128}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="confirm-password">Bekräfta lösenord</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Bekräfta lösenord"
                disabled={isLoading}
                maxLength={128}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading || !username.trim() || !password || (mode === 'register' && !confirmPassword)}
          >
            {isLoading ? (mode === 'register' ? 'Skapar konto...' : 'Loggar in...') : (mode === 'register' ? 'Skapa konto' : 'Logga in')}
          </button>

          <button
            type="button"
            className="login-button"
            onClick={handleGuestLogin}
            disabled={isLoading}
            style={{ marginTop: 10, background: '#444' }}
          >
            Logga in som gäst
          </button>
        </form>

        <div className="login-info">
          <p>Konton kräver nu lösenord för att skydda ditt användarnamn.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;