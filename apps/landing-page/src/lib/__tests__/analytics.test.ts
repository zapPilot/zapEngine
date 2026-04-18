import { pageview, event } from '../analytics';

// Mock window.gtag
declare global {
  interface Window {
    gtag: jest.Mock;
  }
}

describe('analytics', () => {
  beforeEach(() => {
    // Reset the mock before each test
    window.gtag = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('pageview', () => {
    it('should call gtag with correct config when window.gtag exists', () => {
      pageview('/test-page');

      expect(window.gtag).toHaveBeenCalledTimes(1);
      expect(window.gtag).toHaveBeenCalledWith('config', '', {
        page_path: '/test-page',
      });
    });

    it('should not throw when gtag is undefined', () => {
      // @ts-expect-error - intentionally deleting for test
      delete window.gtag;

      expect(() => pageview('/test')).not.toThrow();
    });

    it('should handle different page paths', () => {
      pageview('/about');
      pageview('/contact');

      expect(window.gtag).toHaveBeenCalledTimes(2);
      expect(window.gtag).toHaveBeenNthCalledWith(1, 'config', '', {
        page_path: '/about',
      });
      expect(window.gtag).toHaveBeenNthCalledWith(2, 'config', '', {
        page_path: '/contact',
      });
    });
  });

  describe('event', () => {
    it('should call gtag with event name and parameters', () => {
      event({ name: 'click', parameters: { button_id: 'cta' } });

      expect(window.gtag).toHaveBeenCalledTimes(1);
      expect(window.gtag).toHaveBeenCalledWith('event', 'click', { button_id: 'cta' });
    });

    it('should work without parameters', () => {
      event({ name: 'page_load' });

      expect(window.gtag).toHaveBeenCalledTimes(1);
      expect(window.gtag).toHaveBeenCalledWith('event', 'page_load', undefined);
    });

    it('should not throw when gtag is undefined', () => {
      // @ts-expect-error - intentionally deleting for test
      delete window.gtag;

      expect(() => event({ name: 'test' })).not.toThrow();
    });

    it('should handle different parameter types', () => {
      event({
        name: 'purchase',
        parameters: {
          value: 100,
          currency: 'USD',
          is_member: true,
        },
      });

      expect(window.gtag).toHaveBeenCalledWith('event', 'purchase', {
        value: 100,
        currency: 'USD',
        is_member: true,
      });
    });
  });
});
