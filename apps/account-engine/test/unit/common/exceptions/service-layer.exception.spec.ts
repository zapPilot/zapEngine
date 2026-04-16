import { ServiceLayerException } from '@common/exceptions';
import { HttpStatus } from '@common/http';

describe('ServiceLayerException', () => {
  it('creates exception with default status code 500', () => {
    const ex = new ServiceLayerException('Something went wrong');
    expect(ex.message).toBe('Something went wrong');
    expect(ex.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(ex.name).toBe('ServiceLayerException');
  });

  it('creates exception with custom status code', () => {
    const ex = new ServiceLayerException('Not found', HttpStatus.NOT_FOUND);
    expect(ex.statusCode).toBe(HttpStatus.NOT_FOUND);
  });

  it('preserves the original cause error', () => {
    const cause = new Error('DB timeout');
    const ex = new ServiceLayerException(
      'Failed to fetch',
      HttpStatus.INTERNAL_SERVER_ERROR,
      cause,
    );
    expect(ex.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const ex = new ServiceLayerException('test');
    expect(ex).toBeInstanceOf(Error);
  });
});
