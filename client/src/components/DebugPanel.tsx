import React, { useState, useEffect } from 'react';
import { debugLogger } from '../utils/debugLogger';
import '../styles/debug-panel.css';

interface LogEntry {
  timestamp: number;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  data?: any[];
}

export const DebugPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isEnabled, setIsEnabled] = useState(debugLogger.isEnabled());
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  // Refresh logs periodically
  useEffect(() => {
    if (!isEnabled) return;

    const interval = setInterval(() => {
      setLogs(debugLogger.getLogs());
    }, 500);

    return () => clearInterval(interval);
  }, [isEnabled]);

  // Auto-scroll to latest log
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isEnabled) {
    return (
      <div className="debug-panel-toggle">
        <button 
          className="debug-toggle-btn"
          onClick={() => {
            debugLogger.enable();
            setIsEnabled(true);
          }}
          title="Enable debug panel"
        >
          🔍
        </button>
      </div>
    );
  }

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return '#ff4444';
      case 'warn': return '#ffaa00';
      case 'info': return '#4488ff';
      default: return '#cccccc';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('sv-SE', { hour12: false });
  };

  return (
    <div className={`debug-panel ${isOpen ? 'open' : 'closed'}`}>
      {/* Toggle Button */}
      <button
        className="debug-panel-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Close debug panel' : 'Open debug panel'}
      >
        🔍 {logs.length}
      </button>

      {/* Panel Content */}
      {isOpen && (
        <div className="debug-panel-content">
          <div className="debug-panel-header">
            <h3>🔍 Debug Logs</h3>
            <div className="debug-panel-controls">
              <button 
                onClick={() => {
                  // Copy all logs to clipboard
                  const logsText = logs
                    .map(log => `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}${log.data ? ' ' + JSON.stringify(log.data) : ''}`)
                    .join('\n');
                  navigator.clipboard.writeText(logsText).then(() => {
                    alert('Logs copied to clipboard!');
                  });
                }}
                title="Copy all logs"
                disabled={logs.length === 0}
              >
                📋
              </button>
              <button 
                onClick={() => {
                  // Remove oldest log (first in array)
                  const currentLogs = debugLogger.getLogs();
                  if (currentLogs.length > 0) {
                    const newLogs = currentLogs.slice(1);
                    debugLogger.clearLogs();
                    // Re-add all logs except the first one
                    (debugLogger as any)['logs'] = newLogs;
                    setLogs(newLogs);
                  }
                }}
                title="Remove oldest log"
                disabled={logs.length === 0}
              >
                ⬆️
              </button>
              <button 
                onClick={() => {
                  debugLogger.clearLogs();
                  setLogs([]);
                }}
                title="Clear all logs"
              >
                🗑️
              </button>
              <button 
                onClick={() => {
                  debugLogger.disable();
                  setIsEnabled(false);
                }}
                title="Close debug panel"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="debug-panel-logs" ref={logsContainerRef}>
            {logs.length === 0 ? (
              <div className="debug-log-empty">No logs yet...</div>
            ) : (
              [...logs].reverse().map((log, displayIdx) => {
                const actualIdx = logs.length - 1 - displayIdx;
                return (
                  <div
                    key={displayIdx}
                    className={`debug-log-entry debug-log-${log.level}`}
                    style={{ borderLeftColor: getLogColor(log.level) }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                      <div style={{ flex: 1 }}>
                        <span className="debug-log-time">{formatTime(log.timestamp)}</span>
                        <span className="debug-log-level">[{log.level.toUpperCase()}]</span>
                        <span className="debug-log-message">{log.message}</span>
                      </div>
                      <button
                        className="debug-log-remove-btn"
                        onClick={() => {
                          debugLogger.removeLog(actualIdx);
                          setLogs(debugLogger.getLogs());
                        }}
                        title="Remove this log"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#aaa',
                          cursor: 'pointer',
                          padding: '0 4px',
                          fontSize: '12px'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    {log.data && log.data.length > 0 && (
                      <div className="debug-log-data">
                        {log.data.map((d, i) => (
                          <div key={i} className="debug-log-data-item">
                            {typeof d === 'object' ? JSON.stringify(d) : String(d)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DebugPanel;
