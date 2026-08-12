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

import {
  assertOpenCliReady,
  createOpenCliBrowserPublisher,
  OpenCliPublishError,
} from './opencli.js';

const FIXED_TIME = new Date('2026-08-12T03:04:05.000Z');
const EPISODE_URL =
  'https://from-fed-to-chain-api.fly.dev/e/123e4567-e89b-42d3-a456-426614174000?lang=zh-Hant';
const VIDEO_PATH = '/fixtures/episode.mp4';
const INSECURE_X_URL = ['http:', '//x.com/example/status/1'].join('');
const INSECURE_REDNOTE_URL = [
  'http:',
  '//www.xiaohongshu.com/explore/note-123',
].join('');

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

interface RednoteScenario {
  bodyText?: string;
  currentUrl?: string;
  failUpload?: boolean;
  failSemanticClick?: boolean;
  failFirstVideoSelector?: boolean;
  failClose?: boolean;
}

function installRednoteScenario(scenario: RednoteScenario = {}): void {
  installCliResponder((args) => {
    if (args[0] !== 'browser' || args[1] !== 'zap-social-rednote') {
      return cliFailure(`Unexpected command: ${args.join(' ')}`);
    }

    const action = args[2];
    if (
      action === 'wait' &&
      scenario.failFirstVideoSelector &&
      args[4] === 'input[type="file"][accept*="video"]'
    ) {
      return cliFailure('selector missing');
    }
    if (action === 'upload' && scenario.failUpload) {
      return cliFailure('upload exited', 'upload rejected');
    }
    if (
      action === 'click' &&
      scenario.failSemanticClick &&
      args.includes('--role')
    ) {
      return cliFailure('semantic button missing');
    }
    if (action === 'get' && args[3] === 'text') {
      return cliOutput(scenario.bodyText ?? '发布成功');
    }
    if (action === 'get' && args[3] === 'url') {
      return cliOutput(
        scenario.currentUrl ?? 'https://www.xiaohongshu.com/explore/note-123',
      );
    }
    if (action === 'close' && scenario.failClose) {
      return cliFailure('close failed');
    }
    return cliOutput('ok');
  });
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

describe('OpenCliPublishError', () => {
  it('retains an Error cause and identifies an X step', () => {
    const cause = new Error('network unavailable');

    const error = new OpenCliPublishError('x', 'post', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OpenCliPublishError');
    expect(error.platform).toBe('x');
    expect(error.step).toBe('post');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'X_PUBLISH_FAILED\nStep: post\nCause: network unavailable',
    );
  });

  it('stringifies a non-Error cause and identifies a Rednote step', () => {
    const error = new OpenCliPublishError('rednote', 'publish', 'rejected');

    expect(error.platform).toBe('rednote');
    expect(error.step).toBe('publish');
    expect(error.cause).toBe('rejected');
    expect(error.message).toBe(
      'REDNOTE_PUBLISH_FAILED\nStep: publish\nCause: rejected',
    );
  });
});

describe('assertOpenCliReady', () => {
  it('checks only the Twitter adapter for X', async () => {
    installCliResponder(() => cliOutput('{"logged_in":true}'));

    await assertOpenCliReady(['x']);

    expect(commandCalls()).toEqual([['twitter', 'whoami', '-f', 'json']]);
  });

  it('checks only the Rednote adapter for Rednote', async () => {
    installCliResponder(() => cliOutput('[{"logged_in":true}]'));

    await assertOpenCliReady(['rednote']);

    expect(commandCalls()).toEqual([['rednote', 'whoami', '-f', 'json']]);
  });

  it('checks each requested platform once in first-seen order', async () => {
    installCliResponder(() => cliOutput('{"logged_in":true}'));

    await assertOpenCliReady(['rednote', 'x', 'rednote', 'x']);

    expect(commandCalls()).toEqual([
      ['rednote', 'whoami', '-f', 'json'],
      ['twitter', 'whoami', '-f', 'json'],
    ]);
  });

  it.each([
    ['false', '{"logged_in":false}'],
    ['a string', '{"logged_in":"true"}'],
    ['null', '{"logged_in":null}'],
    ['missing', '{}'],
  ])('rejects when logged_in is %s', async (_label, response) => {
    installCliResponder(() => cliOutput(response));

    await expect(assertOpenCliReady(['x'])).rejects.toThrow(
      'OpenCLI twitter session is not ready. Run `opencli twitter login` and try again.\ntwitter reported logged_in=false.',
    );
  });

  it('includes Rednote login guidance when Rednote is not ready', async () => {
    installCliResponder(() => cliOutput('{"logged_in":false}'));

    await expect(assertOpenCliReady(['rednote'])).rejects.toThrow(
      'OpenCLI rednote session is not ready. Run `opencli rednote login` and try again.',
    );
  });

  it('reports invalid whoami JSON with adapter context', async () => {
    installCliResponder(() => cliOutput('not-json'));

    await expect(assertOpenCliReady(['x'])).rejects.toThrow(
      'OpenCLI twitter whoami returned invalid JSON.',
    );
  });

  it.each(['[]', 'null', '42', '"ready"', '[[]]'])(
    'rejects a whoami payload with no object row: %s',
    async (response) => {
      installCliResponder(() => cliOutput(response));

      await expect(assertOpenCliReady(['x'])).rejects.toThrow(
        'OpenCLI twitter whoami returned no result row.',
      );
    },
  );

  it('preserves OpenCLI stderr when whoami exits unsuccessfully', async () => {
    installCliResponder(() =>
      cliFailure('process exited with code 1', 'session expired'),
    );

    await expect(assertOpenCliReady(['rednote'])).rejects.toThrow(
      'session expired\nprocess exited with code 1',
    );
  });
});

describe('createOpenCliBrowserPublisher', () => {
  it('publishes trimmed X copy with the episode URL and keeps a valid X URL', async () => {
    const onLog = vi.fn();
    installCliResponder(() =>
      cliOutput(
        JSON.stringify({
          status: true,
          url: 'https://x.com/fromfedtochain/status/12345',
        }),
      ),
    );

    const result = await createOpenCliBrowserPublisher({ onLog }).publishX({
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
    'accepts the documented X success status %j',
    async (status) => {
      installCliResponder(() => cliOutput(JSON.stringify({ status })));

      await expect(
        createOpenCliBrowserPublisher().publishX({
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
      createOpenCliBrowserPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toMatchObject({
      url: 'https://twitter.com/fromfedtochain/status/67890?ref=cli',
    });
  });

  it('records confirmed X success even when the response has no id or URL', async () => {
    installCliResponder(() => cliOutput('{"status":true}'));

    await expect(
      createOpenCliBrowserPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
    });
  });

  it('falls back to a numeric X post id when the returned URL is invalid', async () => {
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
      createOpenCliBrowserPublisher().publishX({
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
  ])('omits the X URL for %s with an invalid id', async (_label, url, id) => {
    installCliResponder(() =>
      cliOutput(JSON.stringify({ status: true, url, id })),
    );

    await expect(
      createOpenCliBrowserPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).resolves.toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
    });
  });

  it('wraps an unconfirmed X response with its message and step', async () => {
    installCliResponder(() =>
      cliOutput(JSON.stringify({ status: false, message: 'rate limited' })),
    );

    const publication = createOpenCliBrowserPublisher().publishX({
      text: 'copy',
      episodeUrl: EPISODE_URL,
    });

    await expect(publication).rejects.toMatchObject({
      name: 'OpenCliPublishError',
      platform: 'x',
      step: 'post',
      message:
        'X_PUBLISH_FAILED\nStep: post\nCause: Twitter post was not confirmed: rate limited',
    });
  });

  it('uses an unknown-status reason when an X failure message is blank', async () => {
    installCliResponder(() => cliOutput('{"status":"failed","message":"   "}'));

    await expect(
      createOpenCliBrowserPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow('Twitter post was not confirmed: unknown status');
  });

  it('wraps invalid X JSON with twitter-post context', async () => {
    installCliResponder(() => cliOutput('{broken'));

    await expect(
      createOpenCliBrowserPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow(
      'X_PUBLISH_FAILED\nStep: post\nCause: OpenCLI twitter post returned invalid JSON.',
    );
  });

  it('wraps an X command failure and preserves stderr and stdout', async () => {
    installCliResponder(() =>
      cliFailure('exit code 1', 'permission denied', 'partial output'),
    );

    await expect(
      createOpenCliBrowserPublisher().publishX({
        text: 'copy',
        episodeUrl: EPISODE_URL,
      }),
    ).rejects.toThrow('permission denied\npartial output\nexit code 1');
  });

  it('publishes Rednote content and retains an explore URL', async () => {
    const onLog = vi.fn();
    installRednoteScenario({ failFirstVideoSelector: true });

    const result = await createOpenCliBrowserPublisher({
      onLog,
    }).publishRednote({
      title: '標題',
      body: '  正文  ',
      hashtags: ['#投資', '##以太坊', '市場'],
      videoPath: VIDEO_PATH,
    });

    expect(result).toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
      url: 'https://www.xiaohongshu.com/explore/note-123',
    });
    expect(commandCalls()).toContainEqual([
      'browser',
      'zap-social-rednote',
      'upload',
      'input[type="file"][accept*=".mp4"]',
      VIDEO_PATH,
      '--nth',
      '0',
    ]);
    expect(commandCalls()).toContainEqual([
      'browser',
      'zap-social-rednote',
      'fill',
      '[contenteditable="true"][class*="content"]',
      '正文\n\n#投資 #以太坊 #市場',
    ]);
    expect(commandCalls().at(-1)).toEqual([
      'browser',
      'zap-social-rednote',
      'close',
    ]);
    expect(onLog.mock.calls.map(([message]) => message)).toEqual([
      '[rednote] Opening publisher',
      '[rednote] Uploading video',
      '[rednote] Filling title and body',
      '[rednote] Publishing',
    ]);
  });

  it('falls back to the legacy publish selector and confirms a discovery URL', async () => {
    installRednoteScenario({
      bodyText: '仍在處理中',
      currentUrl:
        'https://xiaohongshu.com/discovery/item/note-456/?source=creator',
      failSemanticClick: true,
    });

    const result = await createOpenCliBrowserPublisher().publishRednote({
      title: '標題',
      body: '正文',
      hashtags: [],
      videoPath: VIDEO_PATH,
    });

    expect(result.url).toBe(
      'https://xiaohongshu.com/discovery/item/note-456/?source=creator',
    );
    expect(commandCalls()).toContainEqual([
      'browser',
      'zap-social-rednote',
      'click',
      'xhs-publish-btn',
      '--nth',
      '0',
    ]);
  });

  it.each([
    ['HTTP', INSECURE_REDNOTE_URL],
    ['lookalike host', 'https://xiaohongshu.com.evil.test/explore/note-123'],
    ['creator route', 'https://creator.xiaohongshu.com/publish/publish'],
    ['missing note id', 'https://xiaohongshu.com/explore/'],
    ['extra path segment', 'https://xiaohongshu.com/explore/note-123/edit'],
    ['malformed text', 'not a URL'],
  ])('omits a non-public Rednote URL with %s', async (_label, currentUrl) => {
    installRednoteScenario({ currentUrl });

    await expect(
      createOpenCliBrowserPublisher().publishRednote({
        title: '標題',
        body: '正文',
        hashtags: [],
        videoPath: VIDEO_PATH,
      }),
    ).resolves.toEqual({
      status: 'published',
      publishedAt: FIXED_TIME.toISOString(),
    });
  });

  it.each([
    '发布失败',
    '發布失敗',
    '發佈失敗',
    'publish failed',
    'ERROR PUBLISHING',
  ])(
    'fails closed on the explicit Rednote failure text %j',
    async (bodyText) => {
      installRednoteScenario({ bodyText });

      const publication = createOpenCliBrowserPublisher().publishRednote({
        title: '標題',
        body: '正文',
        hashtags: [],
        videoPath: VIDEO_PATH,
      });

      await expect(publication).rejects.toMatchObject({
        name: 'OpenCliPublishError',
        platform: 'rednote',
        step: 'confirm_success',
      });
      expect(commandCalls().at(-1)).toEqual([
        'browser',
        'zap-social-rednote',
        'close',
      ]);
    },
  );

  it('does not treat an arbitrary redirect as Rednote publish success', async () => {
    installRednoteScenario({
      bodyText: '等待結果',
      currentUrl: 'https://creator.xiaohongshu.com/login?redirect=publish',
    });

    const publication = createOpenCliBrowserPublisher()
      .publishRednote({
        title: '標題',
        body: '正文',
        hashtags: [],
        videoPath: VIDEO_PATH,
      })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(31_000);

    expect(await publication).toMatchObject({
      message: expect.stringContaining(
        'Rednote did not show an explicit publish-success state.',
      ),
    });
    expect(commandCalls().at(-1)).toEqual([
      'browser',
      'zap-social-rednote',
      'close',
    ]);
  });

  it('wraps an upload failure and still closes the Rednote browser', async () => {
    installRednoteScenario({ failUpload: true });

    const publication = createOpenCliBrowserPublisher().publishRednote({
      title: '標題',
      body: '正文',
      hashtags: [],
      videoPath: VIDEO_PATH,
    });

    await expect(publication).rejects.toMatchObject({
      name: 'OpenCliPublishError',
      platform: 'rednote',
      step: 'upload_video',
    });
    expect(commandCalls().at(-1)).toEqual([
      'browser',
      'zap-social-rednote',
      'close',
    ]);
  });

  it('does not discard Rednote success when closing the browser fails', async () => {
    installRednoteScenario({ failClose: true });

    await expect(
      createOpenCliBrowserPublisher().publishRednote({
        title: '標題',
        body: '正文',
        hashtags: [],
        videoPath: VIDEO_PATH,
      }),
    ).resolves.toMatchObject({ status: 'published' });
  });
});
