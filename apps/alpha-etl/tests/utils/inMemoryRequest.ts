import type { Application } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { PassThrough } from 'stream';

type Headers = Record<string, string>;

type ResponsePayload = {
  status: number;
  headers: Record<string, string | string[]>;
  text: string;
  body: unknown;
};

type MockSocket = PassThrough & {
  remoteAddress: string;
  remotePort: number;
  localAddress: string;
  localPort: number;
  setTimeout: (...args: unknown[]) => MockSocket;
  setNoDelay: (...args: unknown[]) => MockSocket;
  setKeepAlive: (...args: unknown[]) => MockSocket;
};

class InMemoryTestRequest {
  private readonly app: Application;
  private readonly method: string;
  private readonly path: string;
  private headers: Headers = {};
  private body: unknown = null;
  private expectedStatus: number | null = null;

  constructor(app: Application, method: string, path: string) {
    this.app = app;
    this.method = method;
    this.path = path;
  }

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  type(value: string): this {
    const normalized = value.toLowerCase();
    const mapping: Record<string, string> = {
      form: 'application/x-www-form-urlencoded',
      json: 'application/json',
      html: 'text/html',
      text: 'text/plain',
      xml: 'application/xml',
    };

    this.headers['content-type'] = mapping[normalized] ?? value;
    return this;
  }

  send(payload: unknown): this {
    this.body = payload;

    if (
      payload !== null &&
      typeof payload === 'object' &&
      !Buffer.isBuffer(payload)
    ) {
      if (!this.headers['content-type']) {
        this.headers['content-type'] = 'application/json';
      }
    }

    return this;
  }

  expect(status: number): this {
    this.expectedStatus = status;
    return this;
  }

  then<TResult1 = ResponsePayload, TResult2 = never>(
    onfulfilled?:
      | ((value: ResponsePayload) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: Error) => TResult | PromiseLike<TResult>) | null,
  ): Promise<ResponsePayload | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<ResponsePayload> {
    return this.execute().finally(onfinally ?? undefined);
  }

  private async execute(): Promise<ResponsePayload> {
    const payload = await dispatchRequest(this.app, {
      method: this.method,
      path: this.path,
      headers: this.headers,
      body: this.body,
    });

    if (
      this.expectedStatus !== null &&
      payload.status !== this.expectedStatus
    ) {
      throw new Error(
        `Expected status ${this.expectedStatus} but received ${payload.status}`,
      );
    }

    return payload;
  }
}

function normalizeHeaders(
  headers: Record<string, number | string | string[] | undefined>,
): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

function buildPayload(
  body: unknown,
  headers: Headers,
): { raw: string | Buffer | null; contentType?: string } {
  if (body === null || body === undefined) {
    return { raw: null };
  }

  if (Buffer.isBuffer(body)) {
    return { raw: body };
  }

  if (typeof body === 'string') {
    return { raw: body };
  }

  const json = JSON.stringify(body);
  return {
    raw: json,
    contentType: headers['content-type'] ?? 'application/json',
  };
}

function createMockSocket(): MockSocket {
  const socket = new PassThrough() as MockSocket;
  socket.remoteAddress = '127.0.0.1';
  socket.remotePort = 0;
  socket.localAddress = '127.0.0.1';
  socket.localPort = 0;
  socket.setTimeout = () => socket;
  socket.setNoDelay = () => socket;
  socket.setKeepAlive = () => socket;
  return socket;
}

function dispatchRequest(
  app: Application,
  options: {
    method: string;
    path: string;
    headers: Headers;
    body: unknown;
  },
): Promise<ResponsePayload> {
  return new Promise((resolve, reject) => {
    const socket = createMockSocket();
    const req = new IncomingMessage(socket);

    req.method = options.method;
    req.url = options.path;
    req.headers = { ...options.headers };
    req.socket = socket;
    req.connection = socket;

    const res = new ServerResponse(req);
    res.assignSocket(socket);

    const chunks: Buffer[] = [];

    const captureChunk = (chunk: unknown, encoding?: BufferEncoding) => {
      if (chunk === undefined || chunk === null) {
        return;
      }
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        return;
      }
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk, encoding ?? 'utf8'));
        return;
      }
      chunks.push(Buffer.from(String(chunk), encoding ?? 'utf8'));
    };

    const originalWrite = res.write.bind(res);
    res.write = ((
      chunk: unknown,
      encoding?: BufferEncoding,
      cb?: () => void,
    ) => {
      captureChunk(chunk, encoding);
      return originalWrite(chunk as never, encoding as never, cb);
    }) as typeof res.write;

    const originalEnd = res.end.bind(res);
    res.end = ((
      chunk?: unknown,
      encoding?: BufferEncoding,
      cb?: () => void,
    ) => {
      captureChunk(chunk, encoding);
      return originalEnd(chunk as never, encoding as never, cb);
    }) as typeof res.end;

    const cleanup = () => {
      if (typeof res.detachSocket === 'function') {
        res.detachSocket(socket);
      }
      socket.end();
    };

    res.on('finish', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const headers = normalizeHeaders(res.getHeaders());
      const responseContentType =
        typeof headers['content-type'] === 'string'
          ? headers['content-type']
          : '';
      let body: unknown = text;

      if (responseContentType.includes('application/json') && text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      cleanup();
      resolve({
        status: res.statusCode,
        headers,
        text,
        body,
      });
    });

    res.on('error', (error) => {
      cleanup();
      reject(error);
    });

    const { raw, contentType } = buildPayload(options.body, options.headers);
    if (contentType && !req.headers['content-type']) {
      req.headers['content-type'] = contentType;
    }

    if (raw !== null) {
      req.headers['content-length'] = Buffer.byteLength(raw).toString();
    }

    try {
      app.handle(req, res);
    } catch (error) {
      cleanup();
      reject(
        error instanceof Error ? error : new Error('Request handling failed'),
      );
    }

    // A manually constructed IncomingMessage auto-destroys on end in Node,
    // which tears down the socket shared with the response. Keep the stream
    // alive and mark the request complete so error handling (on-finished)
    // still sees a finished request.
    const reqState = req as unknown as {
      _readableState?: { autoDestroy?: boolean };
    };
    if (reqState._readableState) {
      reqState._readableState.autoDestroy = false;
    }

    process.nextTick(() => {
      req.complete = true;
      if (raw !== null) {
        req.push(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
      }
      req.push(null);
    });
  });
}

function request(app: Application): {
  get: (path: string) => InMemoryTestRequest;
  post: (path: string) => InMemoryTestRequest;
  put: (path: string) => InMemoryTestRequest;
  patch: (path: string) => InMemoryTestRequest;
  delete: (path: string) => InMemoryTestRequest;
} {
  return {
    get: (path: string) => new InMemoryTestRequest(app, 'GET', path),
    post: (path: string) => new InMemoryTestRequest(app, 'POST', path),
    put: (path: string) => new InMemoryTestRequest(app, 'PUT', path),
    patch: (path: string) => new InMemoryTestRequest(app, 'PATCH', path),
    delete: (path: string) => new InMemoryTestRequest(app, 'DELETE', path),
  };
}

export default request;
export type { ResponsePayload };
