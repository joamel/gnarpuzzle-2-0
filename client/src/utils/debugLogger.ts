/**
 * Debug logger that captures console logs and stores them for display in UI
 */

interface LogEntry {
  timestamp: number;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  data?: any[];
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private enabled = false;

  constructor() {
    // Check if debug mode is enabled via URL param or localStorage
    this.enabled = typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).has('debug') ||
      localStorage.getItem('debug_mode') === 'true'
    );

    if (this.enabled) {
      this.interceptConsoleLogs();
      console.log('🔍 Debug logger enabled');
    }
  }

  private interceptConsoleLogs() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      this.addLog('log', args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      this.addLog('error', args);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      this.addLog('warn', args);
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      this.addLog('info', args);
    };
  }

  private addLog(level: LogEntry['level'], data: any[]) {
    // Convert first argument to string message
    const message = data[0]?.toString?.() || String(data[0]);
    
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data: data.slice(1),
    };

    this.logs.push(entry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Also store in sessionStorage for persistence
    try {
      sessionStorage.setItem('debug_logs', JSON.stringify(this.logs));
    } catch (e) {
      // Storage full, remove oldest
      this.logs = this.logs.slice(-50);
      sessionStorage.setItem('debug_logs', JSON.stringify(this.logs));
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  removeLog(index: number): void {
    // Remove log at index (counting from newest/end)
    if (index >= 0 && index < this.logs.length) {
      this.logs.splice(index, 1);
      try {
        sessionStorage.setItem('debug_logs', JSON.stringify(this.logs));
      } catch (e) {
        // Ignore
      }
    }
  }

  clearLogs() {
    this.logs = [];
    sessionStorage.removeItem('debug_logs');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable() {
    if (!this.enabled) {
      this.enabled = true;
      localStorage.setItem('debug_mode', 'true');
      this.interceptConsoleLogs();
      console.log('🔍 Debug logger enabled');
    }
  }

  disable() {
    this.enabled = false;
    localStorage.removeItem('debug_mode');
    console.log('🔍 Debug logger disabled');
  }
}

export const debugLogger = new DebugLogger();
