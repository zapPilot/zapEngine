import { getErrorMessage } from '@common/utils/error-message.util';

describe('getErrorMessage', () => {
  it('returns message from an Error instance', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe(
      'something broke',
    );
  });

  it('returns the string itself when passed a plain string', () => {
    expect(getErrorMessage('plain string error')).toBe('plain string error');
  });

  it('returns message property from a plain object with a string message', () => {
    expect(getErrorMessage({ message: 'object message' })).toBe(
      'object message',
    );
  });

  it('JSON.stringifies a plain object without a string message field', () => {
    const obj = { code: 42, reason: 'timeout' };
    expect(getErrorMessage(obj)).toBe(JSON.stringify(obj));
  });

  it('JSON.stringifies a plain object where message is not a string', () => {
    const obj = { message: 123 };
    expect(getErrorMessage(obj)).toBe(JSON.stringify(obj));
  });

  it('returns String() for null', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('returns String() for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('returns String() for a number', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('returns String() for a boolean', () => {
    expect(getErrorMessage(false)).toBe('false');
  });
});
