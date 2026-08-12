import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

type ExecFileMock = (
  binary: string,
  args: readonly string[],
  options: Record<string, unknown>,
  callback: ExecFileCallback,
) => void;

interface CliResponse {
  error: Error | null;
  stdout: string;
  stderr: string;
}

const mocks = vi.hoisted(() => ({
  access: vi.fn<(path: string) => Promise<void>>(),
  execFile: vi.fn<ExecFileMock>(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: mocks.execFile,
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  access: mocks.access,
}));

import { assertXSessionReady, createOpenCliXPublisher } from './opencli.js';

const FIXED_TIME = new Date('2026-08-12T03:04:05.000Z');
const EPISODE_URL =
  'https://from-fed-to-chain-api.fly.dev/e/123e4567-e89b-42d3-a456-426614174000?lang=zh-Hant';
const INSECURE_X_URL = ['http:', '//x.com/example/status/1'].join('');

function cliOutput(stdout: string): CliResponse {
  return { error: null, stdout, stderr: '' };
}

function cliFailure(message: string, stderr = '', stdout = ''): CliResponse {
  return { error: new Error(message), stderr, stdout };
}

function installCliResponder(
  respond: (args: readonly string[]) => CliResponse,
): void {
  mocks.execFile.mockImplementation((_binary, args, _options, callback) => {
    const response = respond(args);
    callback(response.error, response.stdout, response.stderr);
  });
}

function commandCalls(): string[][] {
  return mocks.execFile.mock.calls.map(([, args]) => [...args]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TIME);
  mocks.access.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('assertXSessionReady', () => {
  it('checks the Twitter adapter session', async () => {
    installCliResponder(() => cliOutput('{"logged_in":true}'));

    await assertXSessionReady();

    expect(commandCalls()).toEqual([['twitter', 'whoami', '-f', 'json']]);
  });

  it('accepts an array-wrapped whoami row', async () => {
    installCliResponder(() => cliOutput('[{"logged_in":true}]'));

    await expect(assertXSessionReady()).resolves.toBeUndefined();
  });

  it.each([
    ['false', '{"logged_in":false}'],
    ['a string', '{"logged_in":"true"}'],
    ['null', '{"logged_in":null}'],
    ['missing', '{}'],
  ])('rejects when logged_in is %s', async (_label, response) => {
    installCliResponder(() => cliOutput(response));

    await expect(assertXSessionReady()).rejects.toThrow(
      'OpenCLI twitter session is not ready. Run `opencli twitter login` and try again.\ntwitter reported logged_in=false.',
    );
  });

  it('reports invalid whoami JSON with adapter context', async () => {
    installCliResponder(() => cliOutput('not-json'));

    await expect(assertXSessionReady()).rejects.toThrow(
      'OpenCLI twitter whoami returned invalid JSON.',
    );
  });

  it.each(['[]', 'null', '42', '"ready"', '[[]]'])(
    'rejects a whoami payload with no object row: %s',
    async (response) => {
      installCliResponder(() => cliOutput(response));

      await expect(assertXSessionReady()).rejects.toThrow(
        'OpenCLI twitter whoami returned no result row.',
      );
    },
  );

  it('preserves OpenCLI stderr when whoami exits unsuccessfully', async () => {
    installCliResponder(() =>
      cliFailure('process exited with code 1', 'session expired'),
    );

    await expect(assertXSessionReady()).rejects.toThrow(
      'session expired\nprocess exited with code 1',
    );
  });
});

describe('createOpenCliXPublisher', () => {
  it('publishes trimmed copy with the episode URL and keeps a valid X URL', async () => {
    const onLog = vi.fn();
    installCliResponder(() =>
      cliOutput(
        JSON.stringify({
          status: true,
          url: 'https://x.com/fromfedtochain/status/12345',
        }),
      ),
    );

    const result = await createOpenCliXPublisher({ onLog }).publishX({
      text: '  測試貼文  ',
      episodeUrl: EPISODE_URL,
    });

    expect(result).toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
      url: 'https://x.com/fromfedtochain/status/12345',
    });
    expect(commandCalls()).toEqual([
      ['twitter', 'post', `測試貼文\n\n${EPISODE_URL}`, '-f', 'json'],
    ]);
    expect(onLog).toHaveBeenCalledWith('[x] Publishing copy and episode link');
  });

  it.each(['ok', 'POSTED', ' published ', 'Success', 'succeeded'])(
    'accepts the documented success status %j',
    async (status) => {
      installCliResponder(() => cliOutput(JSON.stringify({ status })));

      await expect(
        createOpenCliXPublisher().publishX({
          text: 'copy',
          episodeUrl: EPISODE_URL,
        }),
      ).resolves.toEqual({
        status: 'published',
        publishedAt: FIXED_TIME.toISOString(),
      });
    },
  );

  it('accepts an array response and a valid Twitter URL', async () => {
    installCliResponder(() =>
      cliOutput(
        JSON.stringify([
          {
            status: 'success',
            url: 'https://twitter.com/fromfedtochain/status/67890?ref=cli',
          },
        ]),
      ),
    );

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toMatchObject({
      url: 'https://twitter.com/fromfedtochain/status/67890?ref=cli',
    });
  });

  it('records confirmed success even when the response has no id or URL', async () => {
    installCliResponder(() => cliOutput('{"status":true}'));

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
    });
  });

  it('falls back to a numeric post id when the returned URL is invalid', async () => {
    installCliResponder(() =>
      cliOutput(
        JSON.stringify({
          status: true,
          url: 'https://example.com/not-an-x-post',
          id: ' 987654321 ',
        }),
      ),
    );

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toMatchObject({
      url: 'https://x.com/i/status/987654321',
    });
  });

  it.each([
    ['an HTTP X URL', INSECURE_X_URL, 'not-numeric'],
    ['a foreign host', 'https://example.com/status/1', ''],
    ['a non-status path', 'https://x.com/example/home', 'abc'],
    ['malformed URL text', 'not a url', '-123'],
  ])('omits the URL for %s with an invalid id', async (_label, url, id) => {
    installCliResponder(() =>
      cliOutput(JSON.stringify({ status: true, url, id })),
    );

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
    });
  });

  it('wraps an unconfirmed response with its message and step', async () => {
    installCliResponder(() =>
      cliOutput(JSON.stringify({ status: false, message: 'rate limited' })),
    );

    const publication = createOpenCliXPublisher().publishX({
      text: 'copy',
      episodeUrl: EPISODE_URL,
    });

    await expect(publication).rejects.toMatchObject({
      name: 'SocialPublishError',
      step: 'post',
      message:
        'X_PUBLISH_FAILED\nStep: post\nCause: Twitter post was not confirmed: rate limited',
    });
  });

  it('uses an unknown-status reason when a failure message is blank', async () => {
    installCliResponder(() => cliOutput('{"status":"failed","message":"   "}'));

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow('Twitter post was not confirmed: unknown status');
  });

  it('wraps invalid JSON with twitter-post context', async () => {
    installCliResponder(() => cliOutput('{broken'));

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow(
      'X_PUBLISH_FAILED\nStep: post\nCause: OpenCLI twitter post returned invalid JSON.',
    );
  });

  it('wraps a command failure and preserves stderr and stdout', async () => {
    installCliResponder(() =>
      cliFailure('exit code 1', 'permission denied', 'partial output'),
    );

    await expect(
      createOpenCliXPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow('permission denied\npartial output\nexit code 1');
  });
});
