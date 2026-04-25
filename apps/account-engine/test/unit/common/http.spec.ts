import {
  AppError,
  BadRequestException,
  ConflictException,
  getErrorStatus,
  HttpException,
  HttpStatus,
  NotFoundException,
  RateLimitException,
  toErrorResponse,
  UnauthorizedException,
} from '@/common/http';

describe('HttpException', () => {
  describe('getStatus()', () => {
    it('returns the status code passed at construction', () => {
      const exc = new HttpException('Something failed', HttpStatus.BAD_REQUEST);
      expect(exc.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('defaults to 500 when no status code is supplied', () => {
      const exc = new HttpException('Oops');
      expect(exc.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('getResponse()', () => {
    it('returns an object containing the message', () => {
      const exc = new HttpException('Something failed', HttpStatus.BAD_REQUEST);
      expect(exc.getResponse()).toEqual({ message: 'Something failed' });
    });
  });
});

describe('BadRequestException', () => {
  it('uses the default message and 400 status', () => {
    const exc = new BadRequestException();
    expect(exc.message).toBe('Bad request');
    expect(exc.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(exc.name).toBe('BadRequestException');
  });

  it('accepts a custom message and cause', () => {
    const cause = new Error('original error');
    const exc = new BadRequestException('Custom bad request', cause);
    expect(exc.message).toBe('Custom bad request');
    expect(exc.cause).toBe(cause);
  });
});

describe('UnauthorizedException', () => {
  it('uses the default message and 401 status', () => {
    const exc = new UnauthorizedException();
    expect(exc.message).toBe('Unauthorized');
    expect(exc.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(exc.name).toBe('UnauthorizedException');
  });

  it('accepts a custom message and cause', () => {
    const cause = new Error('token expired');
    const exc = new UnauthorizedException('Session expired', cause);
    expect(exc.message).toBe('Session expired');
    expect(exc.cause).toBe(cause);
  });
});

describe('NotFoundException', () => {
  it('uses the default message and 404 status', () => {
    const exc = new NotFoundException();
    expect(exc.message).toBe('Not found');
    expect(exc.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(exc.name).toBe('NotFoundException');
  });

  it('accepts a custom message and cause', () => {
    const cause = new Error('missing row');
    const exc = new NotFoundException('User not found', cause);
    expect(exc.message).toBe('User not found');
    expect(exc.cause).toBe(cause);
  });
});

describe('ConflictException', () => {
  it('uses the default message and 409 status', () => {
    const exc = new ConflictException();
    expect(exc.message).toBe('Conflict');
    expect(exc.statusCode).toBe(HttpStatus.CONFLICT);
    expect(exc.name).toBe('ConflictException');
  });

  it('accepts a custom message and cause', () => {
    const cause = new Error('duplicate key value');
    const exc = new ConflictException('Email already in use', cause);
    expect(exc.message).toBe('Email already in use');
    expect(exc.cause).toBe(cause);
  });
});

describe('RateLimitException', () => {
  it('uses the default message and 429 status', () => {
    const exc = new RateLimitException();
    expect(exc.message).toBe('Too many requests');
    expect(exc.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(exc.name).toBe('RateLimitException');
  });

  it('accepts a custom message and cause', () => {
    const cause = new Error('quota exceeded');
    const exc = new RateLimitException('Slow down', cause);
    expect(exc.message).toBe('Slow down');
    expect(exc.cause).toBe(cause);
  });
});

describe('getErrorStatus', () => {
  it('returns statusCode from an AppError instance', () => {
    const err = new AppError('unprocessable', 422);
    expect(getErrorStatus(err)).toBe(422);
  });

  it('returns statusCode from an HttpException subclass', () => {
    const err = new NotFoundException('gone');
    expect(getErrorStatus(err)).toBe(HttpStatus.NOT_FOUND);
  });

  it('returns statusCode from a plain object with a numeric statusCode', () => {
    expect(getErrorStatus({ statusCode: 503 })).toBe(503);
  });

  it('returns 500 for a plain object with a non-numeric statusCode', () => {
    expect(getErrorStatus({ statusCode: 'bad' })).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('returns 500 for a plain object with no statusCode property', () => {
    expect(getErrorStatus({ message: 'something went wrong' })).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('returns 500 for null', () => {
    expect(getErrorStatus(null)).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('returns 500 for a plain string', () => {
    expect(getErrorStatus('something went wrong')).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('returns 500 for undefined', () => {
    expect(getErrorStatus(undefined)).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});

describe('toErrorResponse', () => {
  it('returns the correct shape for an HttpException', () => {
    const err = new NotFoundException('Resource not found');
    const result = toErrorResponse('/api/users/42', err);

    expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(result.message).toBe('Resource not found');
    expect(result.path).toBe('/api/users/42');
    expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('falls back to 500 and serializes the message for a generic Error', () => {
    const err = new Error('unexpected crash');
    const result = toErrorResponse('/api/jobs', err);

    expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe('unexpected crash');
    expect(result.path).toBe('/api/jobs');
  });
});
