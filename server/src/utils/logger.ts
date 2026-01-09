/**
 * Structured logging utility for GnarPuzzle backend
 * 
 * Log levels:
 * - error: Critical errors (always logged + to file)
 * - warn: Warnings (production + development)
 * - info: Important operational events (production + development)
 * - debug: Detailed debugging (development only)
 */

import * as winston from 'winston';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, category, ...metadata }) => {
  let msg = `[${timestamp}] ${level.toUpperCase()}`;
  if (category) msg += ` [${category}]`;
  msg += `: ${message}`;
  
  // Add metadata if present (excluding empty objects)
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    // Error log file (always enabled)
    new winston.transports.File({ 
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file (production only)
    ...(isProduction ? [
      new winston.transports.File({ 
        filename: path.join('logs', 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ] : []),
  ]
});

// Console output (always, but colored in development)
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    customFormat
  )
}));

// Helper functions for categorized logging
export const createCategoryLogger = (category: string) => ({
  error: (message: string, metadata?: any) => logger.error(message, { category, ...metadata }),
  warn: (message: string, metadata?: any) => logger.warn(message, { category, ...metadata }),
  info: (message: string, metadata?: any) => logger.info(message, { category, ...metadata }),
  debug: (message: string, metadata?: any) => logger.debug(message, { category, ...metadata }),
});

// Pre-configured category loggers
export const gameLogger = createCategoryLogger('GAME');
export const socketLogger = createCategoryLogger('SOCKET');
export const roomLogger = createCategoryLogger('ROOM');
export const dbLogger = createCategoryLogger('DATABASE');
export const authLogger = createCategoryLogger('AUTH');

export { logger };
export default logger;