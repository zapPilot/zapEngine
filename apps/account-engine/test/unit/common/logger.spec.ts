import { Logger } from '@common/logger';

describe('Logger', () => {
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('log()', () => {
    it('calls console.info with INFO level', () => {
      const logger = new Logger('Test');
      logger.log('hello');
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0][0]).toContain('INFO');
      expect(infoSpy.mock.calls[0][0]).toContain('hello');
    });
  });

  describe('debug()', () => {
    it('calls console.info with DEBUG level', () => {
      const logger = new Logger('Test');
      logger.debug('debug msg');
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0][0]).toContain('DEBUG');
    });
  });

  describe('warn()', () => {
    it('calls console.warn with WARN level', () => {
      const logger = new Logger('Test');
      logger.warn('warning');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('WARN');
    });
  });

  describe('error()', () => {
    it('calls console.error with ERROR level', () => {
      const logger = new Logger('Test');
      logger.error('oops');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('ERROR');
    });
  });

  describe('scope formatting', () => {
    it('includes the scope in square brackets', () => {
      const logger = new Logger('MyScope');
      logger.log('msg');
      expect(infoSpy.mock.calls[0][0]).toContain('[MyScope]');
    });

    it('omits brackets for an empty scope', () => {
      const logger = new Logger('');
      logger.log('msg');
      const line: string = infoSpy.mock.calls[0][0];
      expect(line).not.toContain('[');
    });
  });

  describe('metadata serialization', () => {
    it('serializes a string meta entry verbatim', () => {
      const logger = new Logger('Test');
      logger.log('msg', 'extra info');
      expect(infoSpy.mock.calls[0][0]).toContain('extra info');
    });

    it('serializes an Error meta entry as its stack trace', () => {
      const logger = new Logger('Test');
      const err = new Error('test error');
      logger.log('msg', err);
      const line: string = infoSpy.mock.calls[0][0];
      // The stack contains the error message
      expect(line).toContain('test error');
    });

    it('serializes a plain object meta entry as JSON', () => {
      const logger = new Logger('Test');
      logger.log('msg', { key: 'value' });
      expect(infoSpy.mock.calls[0][0]).toContain('"key":"value"');
    });
  });

  describe('timestamp', () => {
    it('includes an ISO 8601 timestamp', () => {
      const logger = new Logger('Test');
      logger.log('msg');
      const line: string = infoSpy.mock.calls[0][0];
      expect(line).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
