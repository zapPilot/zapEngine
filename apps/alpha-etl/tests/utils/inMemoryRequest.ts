import type { Application } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { PassThrough } from 'stream';
import { parse as parseQuery } from 'querystring';

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

type MutableIncomingRequest = IncomingMessage & { app?: Application; res?: ServerResponse; body?: unknown; _body?: boolean };
type MutableServerResponse = ServerResponse & { app?: Application; req?: IncomingMessage };
type ExpressBodyParseError = Error & { status?: number; type?: string };

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
      xml: 'application/xml'
    };

    this.headers['content-type'] = mapping[normalized] ?? value;
    return this;
  }

  send(payload: unknown): this {
    this.body = payload;

    if (payload !== null && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
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
    onfulfilled?: ((value: ResponsePayload) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: Error) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: Error) => TResult | PromiseLike<TResult>) | null
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
      body: this.body
    });

    if (this.expectedStatus !== null && payload.status !== this.expectedStatus) {
      throw new Error(`Expected status ${this.expectedStatus} but received ${payload.status}`);
    }

    return payload;
  }
}

function normalizeHeaders(headers: Record<string, number | string | string[] | undefined>): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

function buildPayload(body: unknown, headers: Headers): { raw: string | Buffer | null; contentType?: string } {
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
  return { raw: json, contentType: headers['content-type'] ?? 'application/json' };
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

function createExpressBodyParseError(error: unknown): ExpressBodyParseError {
  const parseError = error instanceof Error ? error : new SyntaxError('Invalid JSON');
  parseError.status = 400;
  parseError.type = 'entity.parse.failed';
  return parseError;
}

function dispatchRequest(
  app: Application,
  options: {
    method: string;
    path: string;
    headers: Headers;
    body: unknown;
  }
): Promise<ResponsePayload> {
  return new Promise((resolve, reject) => {
    const socket = createMockSocket();
    const req = new IncomingMessage(socket);
    const mutableReq = req as MutableIncomingRequest;

    req.method = options.method;
    req.url = options.path;
    req.headers = { ...options.headers };
    req.socket = socket;
    req.connection = socket;

    const res = new ServerResponse(req);
    const mutableRes = res as MutableServerResponse;
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
    res.write = ((chunk: unknown, encoding?: BufferEncoding, cb?: () => void) => {
      captureChunk(chunk, encoding);
      return originalWrite(chunk as never, encoding as never, cb);
    }) as typeof res.write;

    const originalEnd = res.end.bind(res);
    res.end = ((chunk?: unknown, encoding?: BufferEncoding, cb?: () => void) => {
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
      const responseContentType = typeof headers['content-type'] === 'string' ? headers['content-type'] : '';
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
        body
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

    const contentTypeHeader = req.headers['content-type'];
    const contentTypeValue = typeof contentTypeHeader === 'string' ? contentTypeHeader.toLowerCase() : '';
    const isJsonBody = contentTypeValue.includes('application/json');
    const isFormBody = contentTypeValue.includes('application/x-www-form-urlencoded');

    const primeExpressResponse = () => {
      const appAny = app as Application & { request?: object; response?: object };
      if (appAny.request && Object.getPrototypeOf(req) !== appAny.request) {
        Object.setPrototypeOf(req, appAny.request);
      }
      if (appAny.response && Object.getPrototypeOf(res) !== appAny.response) {
        Object.setPrototypeOf(res, appAny.response);
      }
      mutableReq.app = app;
      mutableRes.app = app;
      mutableReq.res = res;
      mutableRes.req = req;
    };

    if (isJsonBody && options.body !== null && typeof options.body === 'object' && !Buffer.isBuffer(options.body)) {
      mutableReq.body = options.body;
      mutableReq._body = true;
    }

    if (typeof options.body === 'string' && (isJsonBody || isFormBody)) {
      if (isJsonBody) {
        try {
          mutableReq.body = JSON.parse(options.body);
          mutableReq._body = true;
        } catch (error) {
          const parseError = createExpressBodyParseError(error);

          const routerStack = (app as Application & { _router?: { stack: Array<{ handle?: (...args: unknown[]) => void }> } })._router?.stack ?? [];
          const errorHandlerLayer = [...routerStack].reverse().find((layer) => (layer.handle?.length ?? 0) === 4);

          if (errorHandlerLayer?.handle) {
            primeExpressResponse();
            (errorHandlerLayer.handle as (
              err: Error,
              req: IncomingMessage,
              res: ServerResponse,
              next: () => void
            ) => void)(parseError, req, res, () => {});
          } else {
            primeExpressResponse();
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }

          return;
        }
      }

      if (isFormBody) {
        mutableReq.body = parseQuery(options.body);
        mutableReq._body = true;
      }
    }

    const shouldStreamBody = raw !== null && !mutableReq._body;

    try {
      app.handle(req, res);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error('Request handling failed'));
    }

    process.nextTick(() => {
      if (!shouldStreamBody) {
        return;
      }
      if (socket.readableEnded || socket.destroyed) {
        return;
      }
      socket.push(raw);
      socket.push(null);
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
