import { expect, it } from 'vitest';

import { describeError } from './errors.js';

it('keeps the cause visible while redacting credential-bearing URLs', () => {
  expect(
    describeError(
      new Error('HTTP request failed. URL: https://rpc.example/v2/secret'),
    ),
  ).toBe('Error: HTTP request failed. URL: <url>');
  expect(
    describeError(
      Object.assign(new Error('long\nURL: https://rpc.example/key'), {
        name: 'HttpRequestError',
        shortMessage: 'HTTP request failed.',
      }),
    ),
  ).toBe('HttpRequestError: HTTP request failed.');
  expect(describeError('bot123456:AAH-secret_token rejected')).toBe(
    'bot<token> rejected',
  );
  expect(describeError(new Error('x'.repeat(600)))).toHaveLength(500);
});
