import React, { useCallback, useEffect, useRef, useState } from 'react';

interface LobbyMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

interface PlayersListProps {
  playerList: LobbyMember[];
  readyPlayers: Set<string>;
  authUserId: string | number | undefined;
  isReady: boolean;
  maxPlayers: number;
  onReadyChange: (newReadyStatus: boolean) => void;
  canKick?: boolean;
  onKick?: (userId: string, username: string, skipConfirm?: boolean) => void;
}

const PlayersList: React.FC<PlayersListProps> = ({
  playerList,
  readyPlayers,
  authUserId,
  isReady,
  maxPlayers,
  onReadyChange,
  canKick = false,
  onKick
}) => {
  const [kickMenuUserId, setKickMenuUserId] = useState<string | null>(null);
  const longPressTimerIdRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number; userId: string } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');

  const closeKickMenu = useCallback(() => {
    setKickMenuUserId(null);
  }, []);

  const openKickMenu = useCallback((userId: string) => {
    setKickMenuUserId((current) => (current === userId ? null : userId));
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerIdRef.current !== null) {
      window.clearTimeout(longPressTimerIdRef.current);
      longPressTimerIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!kickMenuUserId) return;

    const handlePointerDown = (evt: PointerEvent) => {
      const target = evt.target as HTMLElement | null;
      if (!target) return;

      const openItem = target.closest(`[data-player-id="${kickMenuUserId}"]`);
      if (!openItem) closeKickMenu();
    };

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') closeKickMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [kickMenuUserId, closeKickMenu]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  const startLongPress = useCallback(
    (evt: React.PointerEvent, userId: string, canOpenMenu: boolean) => {
      if (!canOpenMenu) return;

      lastPointerTypeRef.current = evt.pointerType || 'mouse';
      pressStartRef.current = { x: evt.clientX, y: evt.clientY, userId };
      clearLongPressTimer();

      // Touch: open menu via long-press to avoid accidental taps while scrolling.
      if (lastPointerTypeRef.current === 'touch') {
        longPressTimerIdRef.current = window.setTimeout(() => {
          openKickMenu(userId);
          clearLongPressTimer();
        }, 450);
      }
    },
    [clearLongPressTimer, openKickMenu]
  );

  const cancelLongPressIfMoved = useCallback(
    (evt: React.PointerEvent) => {
      if (!pressStartRef.current) return;

      const dx = evt.clientX - pressStartRef.current.x;
      const dy = evt.clientY - pressStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 10) {
        clearLongPressTimer();
        pressStartRef.current = null;
      }
    },
    [clearLongPressTimer]
  );

  const endLongPress = useCallback(() => {
    clearLongPressTimer();
    pressStartRef.current = null;
  }, [clearLongPressTimer]);

  return (
    <div className="players-section">
      <h3>Spelare ({playerList.length}/{maxPlayers})</h3>
      <div className="players-list">
        {playerList.map((member, index) => {
          const isCurrentUser = member.userId === String(authUserId);
          const isOwner = member.role === 'owner';
          const isPlayerReady = readyPlayers.has(member.userId);
          const showKick = canKick && !isCurrentUser && !isOwner && typeof onKick === 'function';
          const isKickMenuOpen = showKick && kickMenuUserId === member.userId;

          return (
            <div
              key={`player-${member.userId || index}-${member.username}`}
              className={`player-item ${showKick ? 'kickable' : ''}`}
              data-player-id={member.userId}
              role={showKick ? 'button' : undefined}
              tabIndex={showKick ? 0 : undefined}
              aria-haspopup={showKick ? 'menu' : undefined}
              aria-expanded={showKick ? isKickMenuOpen : undefined}
              onClick={(e) => {
                if (!showKick) return;

                // If user clicked an interactive element inside the row, don't open the menu.
                const target = e.target as HTMLElement | null;
                if (target?.closest('button, input, label, a')) return;

                // Touch uses long-press; desktop click opens.
                if (lastPointerTypeRef.current === 'touch') return;
                openKickMenu(member.userId);
              }}
              onKeyDown={(e) => {
                if (!showKick) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openKickMenu(member.userId);
                }
              }}
              onPointerDown={(e) => startLongPress(e, member.userId, showKick)}
              onPointerMove={cancelLongPressIfMoved}
              onPointerUp={endLongPress}
              onPointerCancel={endLongPress}
            >
              <div className="player-info">
                <span className="player-name">{member.username}</span>
                {isCurrentUser && <span className="you-badge">Du</span>}
              </div>
              <div className="player-actions">
                {!isOwner && (
                  <>
                    {isCurrentUser ? (
                      <label className="ready-checkbox">
                        <input
                          type="checkbox"
                          checked={isReady}
                          onChange={(e) => onReadyChange(e.target.checked)}
                        />
                        <span className="checkbox-label">Redo</span>
                      </label>
                    ) : (
                      <span className={`ready-status ${isPlayerReady ? 'ready' : 'not-ready'}`}>
                        {isPlayerReady ? '✓' : '⏳'}
                      </span>
                    )}
                  </>
                )}
                {isOwner && <span className="ready-status owner" title="Spelledare">👑</span>}
                {isKickMenuOpen && (
                  <div
                    className="player-kick-menu"
                    role="menu"
                    aria-label={`Kick-alternativ för ${member.username}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <span className="player-kick-menu-label" aria-hidden="true">Kicka</span>
                    <button
                      type="button"
                      className="player-kick-menu-confirm"
                      onClick={() => {
                        closeKickMenu();
                        // ✓ acts as confirmation, so skip the extra window.confirm.
                        onKick?.(member.userId, member.username, true);
                      }}
                      title="Kicka spelare"
                      aria-label="Kicka spelare"
                      role="menuitem"
                    >
                      <svg
                        className="player-kick-menu-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="player-kick-menu-cancel"
                      onClick={closeKickMenu}
                      title="Avbryt"
                      aria-label="Avbryt"
                      role="menuitem"
                    >
                      <svg
                        className="player-kick-menu-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Show empty slots */}
        {Array.from({ length: Math.max(maxPlayers - playerList.length, 0) }, (_, i) => (
          <div key={`empty-slot-${playerList.length + i}`} className="player-item empty">
            <div className="player-info">
              <span className="player-name">Väntar på spelare...</span>
            </div>
            <div className="player-status waiting">Väntar</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayersList;
