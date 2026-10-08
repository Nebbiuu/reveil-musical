import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemClock } from '../../src/infrastructure/system/SystemClock.js';
import { ConsoleLogger } from '../../src/infrastructure/system/ConsoleLogger.js';
import { FetchHttpClient } from '../../src/infrastructure/system/FetchHttpClient.js';
import { UuidGenerator } from '../../src/infrastructure/system/UuidGenerator.js';

describe('System Infrastructure Adapters Unit Tests', () => {
  describe('SystemClock', () => {
    it('should return a valid current Date', () => {
      const clock = new SystemClock();
      const now = clock.now();
      expect(now).toBeInstanceOf(Date);
      expect(Number.isNaN(now.getTime())).toBe(false);
    });

    it('should format today date string given a timeZone', () => {
      const clock = new SystemClock();
      const str = clock.todayDateString('Europe/Paris');
      expect(str).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should format wake up message with timeZone and locale', () => {
      const clock = new SystemClock();
      const msg = clock.formatWakeUpMessage('LUNDI', 'SOLEIL', 'Europe/Paris', 'fr-FR');
      expect(msg).toContain('Bonjour ! En ce LUNDI, le temps est : SOLEIL');
      expect(msg).toContain('Europe/Paris');
    });
  });

  describe('ConsoleLogger', () => {
    let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
    let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutWriteSpy.mockRestore();
      stderrWriteSpy.mockRestore();
    });

    it('should log structured INFO, DEBUG, and WARN to stdout', () => {
      const logger = new ConsoleLogger('DEBUG');

      logger.debug('Debug message', { key: 'val' });
      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = JSON.parse((stdoutWriteSpy.mock.calls[0]?.[0] as string).trim());
      expect(output.level).toBe('DEBUG');
      expect(output.message).toBe('Debug message');
      expect(output.context).toEqual({ key: 'val' });

      logger.info('Info message');
      logger.warn('Warn message');
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(3);
    });

    it('should log ERROR to stderr and serialize Error instances', () => {
      const logger = new ConsoleLogger('INFO');
      const sampleErr = new Error('Database down');

      logger.error('Something failed', sampleErr, { op: 'db' });
      expect(stderrWriteSpy).toHaveBeenCalledTimes(1);

      const output = JSON.parse((stderrWriteSpy.mock.calls[0]?.[0] as string).trim());
      expect(output.level).toBe('ERROR');
      expect(output.message).toBe('Something failed');
      expect(output.error.message).toBe('Database down');
    });

    it('should filter out logs below configured minLevel', () => {
      const logger = new ConsoleLogger('WARN');
      logger.debug('Will not show');
      logger.info('Will not show');
      expect(stdoutWriteSpy).not.toHaveBeenCalled();

      logger.warn('Will show');
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('UuidGenerator', () => {
    it('should generate valid RFC4122 v4 UUIDs', () => {
      const gen = new UuidGenerator();
      const id = gen.generate();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('FetchHttpClient', () => {
    it('should execute native fetch, parse JSON and return HttpResponse', async () => {
      const mockResponse = { title: 'Test Track' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponse,
      } as Response);

      const client = new FetchHttpClient(2000);
      const res = await client.get<typeof mockResponse>('https://api.example.com/item', {
        headers: { Authorization: 'Bearer test' },
      });

      expect(res.status).toBe(200);
      expect(res.data).toEqual(mockResponse);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/item',
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer test' },
        }),
      );

      fetchSpy.mockRestore();
    });

    it('should throw an error on HTTP error response status', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const client = new FetchHttpClient(1000);
      await expect(client.get('https://api.example.com/404')).rejects.toThrow('HTTP error 404');

      fetchSpy.mockRestore();
    });

    it('should throw timeout error when request is aborted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError);

      const client = new FetchHttpClient(50);
      await expect(client.get('https://slow.api.example.com')).rejects.toThrow('Request timed out');

      fetchSpy.mockRestore();
    });
  });
});
