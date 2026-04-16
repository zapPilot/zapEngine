import { PortfolioNotFoundError } from '@modules/notifications/errors/portfolio-not-found.error';

describe('PortfolioNotFoundError', () => {
  it('is instanceof Error', () => {
    const err = new PortfolioNotFoundError('user-1');
    expect(err).toBeInstanceOf(Error);
  });

  it('is instanceof PortfolioNotFoundError', () => {
    const err = new PortfolioNotFoundError('user-1');
    expect(err).toBeInstanceOf(PortfolioNotFoundError);
  });

  it('has name "PortfolioNotFoundError"', () => {
    const err = new PortfolioNotFoundError('user-1');
    expect(err.name).toBe('PortfolioNotFoundError');
  });

  it('exposes the userId property', () => {
    const err = new PortfolioNotFoundError('user-42');
    expect(err.userId).toBe('user-42');
  });

  it('uses the default message when no message is provided', () => {
    const err = new PortfolioNotFoundError('user-1');
    expect(err.message).toContain('user-1');
    expect(err.message).toContain('Portfolio data not found');
  });

  it('uses a custom message when one is provided', () => {
    const err = new PortfolioNotFoundError('user-1', 'custom message');
    expect(err.message).toBe('custom message');
  });
});
