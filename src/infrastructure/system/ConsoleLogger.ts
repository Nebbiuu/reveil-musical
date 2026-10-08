import { ILogger, LogContext } from '../../domain/ports/ILogger.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export class ConsoleLogger implements ILogger {
  constructor(private readonly minLevel: LogLevel = 'INFO') {}

  private readonly levelWeights: Record<LogLevel, number> = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levelWeights[level] >= this.levelWeights[this.minLevel];
  }

  private write(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    if (error !== undefined) {
      if (error instanceof Error) {
        payload['error'] = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        payload['error'] = error;
      }
    }

    const output = JSON.stringify(payload) + '\n';
    if (level === 'ERROR') {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.write('DEBUG', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.write('INFO', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.write('WARN', message, context);
  }

  public error(message: string, error?: unknown, context?: LogContext): void {
    this.write('ERROR', message, context, error);
  }
}
