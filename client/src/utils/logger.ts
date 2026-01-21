/**
 * Structured logging utility for GnarPuzzle frontend
 * 
 * Log levels:
 * - error: Critical errors (always logged)
 * - warn: Warnings (production + development)
 * - info: Important info (development only)
 * - debug: Debug info (development only)
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  data?: any;
}

class ClientLogger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;

    // Default behavior:
    // - Production: WARN (keep console mostly clean)
    // - Development: WARN by default, opt-in to verbose via localStorage
    //   localStorage.setItem('gnarpuzzle_log_level', 'debug' | 'info' | 'warn' | 'error')
    const stored = this.isDevelopment ? this.getStoredLevel() : null;
    this.level = stored ?? LogLevel.WARN;
  }

  private getStoredLevel(): LogLevel | null {
    try {
      const raw = localStorage.getItem('gnarpuzzle_log_level');
      if (!raw) return null;

      switch (raw.toLowerCase()) {
        case 'error':
          return LogLevel.ERROR;
        case 'warn':
          return LogLevel.WARN;
        case 'info':
          return LogLevel.INFO;
        case 'debug':
          return LogLevel.DEBUG;
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] ${entry.level} [${entry.category}] ${entry.message}`;
  }

  private log(level: LogLevel, category: string, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString().split('T')[1].split('.')[0], // HH:MM:SS only
      level: LogLevel[level],
      category,
      message,
      data,
    };

    const formattedMsg = this.formatEntry(entry);

    // Use appropriate console method with styling
    switch (level) {
      case LogLevel.ERROR:
        console.error(`❌ ${formattedMsg}`, data || '');
        break;
      case LogLevel.WARN:
        console.warn(`⚠️ ${formattedMsg}`, data || '');
        break;
      case LogLevel.INFO:
        console.info(`ℹ️ ${formattedMsg}`, data || '');
        break;
      case LogLevel.DEBUG:
        console.log(`🔍 ${formattedMsg}`, data || '');
        break;
    }
  }

  // Public API
  error(category: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  warn(category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  info(category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  debug(category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  // Specific loggers for common categories
  game = {
    error: (msg: string, data?: any) => this.error('GAME', msg, data),
    warn: (msg: string, data?: any) => this.warn('GAME', msg, data),
    info: (msg: string, data?: any) => this.info('GAME', msg, data),
    debug: (msg: string, data?: any) => this.debug('GAME', msg, data),
  };

  socket = {
    error: (msg: string, data?: any) => this.error('SOCKET', msg, data),
    warn: (msg: string, data?: any) => this.warn('SOCKET', msg, data),
    info: (msg: string, data?: any) => this.info('SOCKET', msg, data),
    debug: (msg: string, data?: any) => this.debug('SOCKET', msg, data),
  };

  room = {
    error: (msg: string, data?: any) => this.error('ROOM', msg, data),
    warn: (msg: string, data?: any) => this.warn('ROOM', msg, data),
    info: (msg: string, data?: any) => this.info('ROOM', msg, data),
    debug: (msg: string, data?: any) => this.debug('ROOM', msg, data),
  };

  api = {
    error: (msg: string, data?: any) => this.error('API', msg, data),
    warn: (msg: string, data?: any) => this.warn('API', msg, data),
    info: (msg: string, data?: any) => this.info('API', msg, data),
    debug: (msg: string, data?: any) => this.debug('API', msg, data),
  };

  pwa = {
    error: (msg: string, data?: any) => this.error('PWA', msg, data),
    warn: (msg: string, data?: any) => this.warn('PWA', msg, data),
    info: (msg: string, data?: any) => this.info('PWA', msg, data),
    debug: (msg: string, data?: any) => this.debug('PWA', msg, data),
  };

  auth = {
    error: (msg: string, data?: any) => this.error('AUTH', msg, data),
    warn: (msg: string, data?: any) => this.warn('AUTH', msg, data),
    info: (msg: string, data?: any) => this.info('AUTH', msg, data),
    debug: (msg: string, data?: any) => this.debug('AUTH', msg, data),
  };
}

// Singleton instance
export const logger = new ClientLogger();
