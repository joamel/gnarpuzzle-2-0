import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { apiService } from '../services/apiService';
import type { MyStats } from '../types/stats';

type UserMenuProps = {
  className?: string;
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
};

const formatRenameError = (err: unknown) => {
  const raw = (err as any)?.message ? String((err as any).message) : String(err || '');
  const msg = raw.trim();

  if (!msg) return 'Kunde inte byta användarnamn.';

  const lower = msg.toLowerCase();

  if (lower.includes('already taken') || lower.includes('already in use') || lower.includes('upptaget')) {
    return 'Det användarnamnet är upptaget. Välj ett annat.';
  }

  if (lower.includes('invalid username')) {
    return 'Ogiltigt användarnamn. Använd 2–20 tecken och bara bokstäver, siffror, _ samt å/ä/ö.';
  }

  if (lower.includes('session expired')) {
    return 'Din session har gått ut. Logga in igen och försök på nytt.';
  }

  return msg;
};

const formatPasswordChangeError = (err: unknown) => {
  const raw = (err as any)?.message ? String((err as any).message) : String(err || '');
  const msg = raw.trim();
  if (!msg) return 'Kunde inte byta lösenord.';

  const lower = msg.toLowerCase();
  if (lower.includes('current password is incorrect') || lower.includes('invalid credentials')) {
    return 'Nuvarande lösenord är fel.';
  }
  if (lower.includes('password not set')) {
    return 'Det här kontot saknar lösenord. Skapa ett konto med lösenord istället.';
  }
  if (lower.includes('new password must be different')) {
    return 'Det nya lösenordet måste vara annorlunda än det nuvarande.';
  }
  if (lower.includes('password must be between') || lower.includes('invalid password')) {
    return 'Ogiltigt lösenord. Använd 8–128 tecken.';
  }
  if (lower.includes('session expired')) {
    return 'Din session har gått ut. Logga in igen och försök på nytt.';
  }

  return msg;
};

const UserMenu: React.FC<UserMenuProps> = ({ className }) => {
  const { user, logout, renameUsername } = useAuth();
  const { currentRoom, gamePhase, leaveRoom } = useGame();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [statsError, setStatsError] = useState<string>('');
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const canShowLeaveRoom = useMemo(() => !!currentRoom, [currentRoom]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setIsOpen(false);
    };

    if (isOpen) {
      window.addEventListener('pointerdown', handlePointerDown);
      return () => window.removeEventListener('pointerdown', handlePointerDown);
    }
  }, [isOpen]);

  if (!user) return null;

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    navigate('/');
  };

  const handleChangeUsername = async () => {
    setIsOpen(false);
    const next = window.prompt('Välj nytt användarnamn (2–20 tecken):', user.username);
    if (!next) return;

    const trimmed = next.trim();
    if (trimmed === user.username) return;

    if (trimmed.length < 2 || trimmed.length > 20) {
      window.alert('Användarnamnet måste vara 2–20 tecken.');
      return;
    }

    try {
      await renameUsername(trimmed);
    } catch (e: any) {
      window.alert(formatRenameError(e));
    }
  };

  const handleOpenStats = async () => {
    setStatsError('');
    setShowStats(true);
    setIsOpen(false);

    setIsLoadingStats(true);
    try {
      const res = await apiService.getMyStats();
      setStats(res.stats);
    } catch (e: any) {
      setStats(null);
      setStatsError(e?.message || 'Kunde inte hämta statistik');
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleOpenChangePassword = () => {
    setIsOpen(false);
    setPasswordError('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowChangePassword(true);
  };

  const handleSubmitChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (currentPassword.length < 8) {
      setPasswordError('Nuvarande lösenord måste vara minst 8 tecken.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Nytt lösenord måste vara minst 8 tecken.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('De nya lösenorden matchar inte.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('Det nya lösenordet måste vara annorlunda än det nuvarande.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiService.changePassword(currentPassword, newPassword);
      setShowChangePassword(false);
      window.alert('✅ Lösenordet är uppdaterat.');
    } catch (e: any) {
      setPasswordError(formatPasswordChangeError(e));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLeaveRoom = async () => {
    setIsOpen(false);

    if (!currentRoom) {
      navigate('/');
      return;
    }

    if (gamePhase && gamePhase !== 'finished') {
      const confirmed = window.confirm('Är du säker på att du vill lämna spelet? Du kommer att försvinna från rummet.');
      if (!confirmed) return;
    }

    try {
      await leaveRoom(true);
    } finally {
      navigate('/');
    }
  };

  return (
    <div ref={containerRef} className={`header-user-menu ${className || ''}`.trim()}>
      <button
        type="button"
        className="header-user-menu-trigger"
        aria-label="Användarmeny"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(v => !v)}
      >
        🙂
      </button>

      {isOpen && (
        <div className="header-user-menu-dropdown" role="menu">
          <div className="header-user-menu-username">{user.username}</div>
          <button type="button" className="header-user-menu-item" onClick={handleChangeUsername}>
            <span className="header-user-menu-icon" aria-hidden="true">✏️</span>
            <span className="header-user-menu-label">Ändra användarnamn</span>
          </button>
          <button type="button" className="header-user-menu-item" onClick={handleOpenChangePassword}>
            <span className="header-user-menu-icon" aria-hidden="true">🔒</span>
            <span className="header-user-menu-label">Byt lösenord</span>
          </button>
          <button type="button" className="header-user-menu-item" onClick={handleOpenStats}>
            <span className="header-user-menu-icon" aria-hidden="true">📊</span>
            <span className="header-user-menu-label">Min statistik</span>
          </button>
          {canShowLeaveRoom && (
            <button type="button" className="header-user-menu-item danger" onClick={handleLeaveRoom}>
              <span className="header-user-menu-icon" aria-hidden="true">🚪</span>
              <span className="header-user-menu-label">Lämna rummet</span>
            </button>
          )}
          <button type="button" className="header-user-menu-item danger" onClick={handleLogout}>
            <span className="header-user-menu-icon" aria-hidden="true">⎋</span>
            <span className="header-user-menu-label">Logga ut</span>
          </button>
        </div>
      )}

      {showStats && (
        <>
          <div className="modal-backdrop" onClick={() => setShowStats(false)} />
          <div className="user-stats-modal" role="dialog" aria-modal="true">
            <div className="modal-header purple-header">
              <h4>📊 Min statistik</h4>
              <button
                onClick={() => setShowStats(false)}
                className="modal-close-button"
                title="Stäng"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              {isLoadingStats ? (
                <p>Hämtar…</p>
              ) : statsError ? (
                <p style={{ color: '#b00020' }}>{statsError}</p>
              ) : stats ? (
                <div className="user-stats-grid">
                  <div className="user-stats-row"><span>Spelade matcher</span><strong>{stats.gamesPlayed}</strong></div>
                  <div className="user-stats-row"><span>Avslutade matcher</span><strong>{stats.gamesFinished}</strong></div>
                  <div className="user-stats-row"><span>Totalpoäng</span><strong>{stats.totalScore}</strong></div>
                  <div className="user-stats-row"><span>Bästa poäng</span><strong>{stats.bestScore}</strong></div>
                  <div className="user-stats-row"><span>Snittpoäng</span><strong>{stats.averageScore}</strong></div>
                  <div className="user-stats-row"><span>Ord hittade</span><strong>{stats.totalWordsFound}</strong></div>
                  <div className="user-stats-row"><span>Senast spelat</span><strong>{formatDateTime(stats.lastPlayedAt)}</strong></div>
                </div>
              ) : (
                <p>Ingen statistik ännu.</p>
              )}
            </div>
          </div>
        </>
      )}

      {showChangePassword && (
        <>
          <div className="modal-backdrop" onClick={() => setShowChangePassword(false)} />
          <div className="user-stats-modal" role="dialog" aria-modal="true">
            <div className="modal-header purple-header">
              <h4>🔒 Byt lösenord</h4>
              <button
                onClick={() => setShowChangePassword(false)}
                className="modal-close-button"
                title="Stäng"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <form onSubmit={handleSubmitChangePassword}>
                <div className="form-group">
                  <label htmlFor="current-password">Nuvarande lösenord</label>
                  <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Ange nuvarande lösenord"
                    autoComplete="current-password"
                    disabled={isChangingPassword}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="new-password">Nytt lösenord</label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Ange nytt lösenord"
                    autoComplete="new-password"
                    disabled={isChangingPassword}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirm-new-password">Bekräfta nytt lösenord</label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Bekräfta nytt lösenord"
                    autoComplete="new-password"
                    disabled={isChangingPassword}
                  />
                </div>

                {passwordError && (
                  <p style={{ color: '#b00020' }}>{passwordError}</p>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isChangingPassword}
                  style={{ width: '100%' }}
                >
                  {isChangingPassword ? 'Byter…' : 'Byt lösenord'}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default UserMenu;
