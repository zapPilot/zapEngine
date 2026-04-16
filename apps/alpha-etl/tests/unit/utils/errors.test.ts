
import { describe, it, expect } from 'vitest';
import {
  ETLError,
  APIError,
  DatabaseError,
  ValidationError,
  TransformError,
} from '../../../src/utils/errors';

function expectErrorBasics(error: Error, expectedName: string, expectedMessage: string): void {
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe(expectedName);
  expect(error.message).toBe(expectedMessage);
}

describe('Custom Errors', () => {
  it('should create an ETLError with the correct properties', () => {
    const error = new ETLError('ETL process failed', 'test-source');
    expect(error).toBeInstanceOf(ETLError);
    expectErrorBasics(error, 'ETLError', 'ETL process failed');
    expect(error.source).toBe('test-source');
  });

  it('should create an APIError with the correct properties', () => {
    const error = new APIError('Failed to fetch data', 500, 'http://test.com', 'api-source');
    expect(error).toBeInstanceOf(ETLError);
    expect(error).toBeInstanceOf(APIError);
    expectErrorBasics(error, 'APIError', 'Failed to fetch data');
    expect(error.statusCode).toBe(500);
    expect(error.url).toBe('http://test.com');
    expect(error.source).toBe('api-source');
  });

  it('should create a DatabaseError with the correct properties', () => {
    const error = new DatabaseError('Failed to write to DB', 'insert');
    expect(error).toBeInstanceOf(ETLError);
    expect(error).toBeInstanceOf(DatabaseError);
    expectErrorBasics(error, 'DatabaseError', 'Failed to write to DB');
    expect(error.operation).toBe('insert');
  });

  it('should create a ValidationError with the correct properties', () => {
    const error = new ValidationError('Invalid field', 'email', 'not-an-email');
    expect(error).toBeInstanceOf(ETLError);
    expect(error).toBeInstanceOf(ValidationError);
    expectErrorBasics(error, 'ValidationError', 'Invalid field');
    expect(error.field).toBe('email');
    expect(error.value).toBe('not-an-email');
  });

  it('should create a TransformError with the correct properties', () => {
    const record = { id: 1, value: 'abc' };
    const error = new TransformError('Transformation failed', record, 'transform-source');
    expect(error).toBeInstanceOf(ETLError);
    expect(error).toBeInstanceOf(TransformError);
    expectErrorBasics(error, 'TransformError', 'Transformation failed');
    expect(error.record).toEqual(record);
    expect(error.source).toBe('transform-source');
  });
});
