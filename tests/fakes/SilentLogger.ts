import { ILogger, LogContext } from '../../src/domain/ports/ILogger.js';

export class SilentLogger implements ILogger {
  public logs: Array<{ level: string; message: string; context?: LogContext; error?: unknown }> = [];

  public debug(message: string, context?: LogContext): void {
    this.logs.push({ level: 'DEBUG', message, context });
  }

  public info(message: string, context?: LogContext): void {
    this.logs.push({ level: 'INFO', message, context });
  }

  public warn(message: string, context?: LogContext): void {
    this.logs.push({ level: 'WARN', message, context });
  }

  public error(message: string, error?: unknown, context?: LogContext): void {
    this.logs.push({ level: 'ERROR', message, context, error });
  }
}
