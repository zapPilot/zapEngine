import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { describeError } from '../lib/errors.js';

export type RunState = 'idle' | 'running' | 'succeeded' | 'failed';

export interface TriggerServerDeps {
  /** Runs one full demo; resolves with the outcome label. */
  run: (log: (line: string) => void) => Promise<string>;
  log: (line: string) => void;
}

const LOG_LIMIT = 200;
const TRIGGER_HEADER = 'x-zap-trigger';
// Only the local app may trigger a run that spends real funds.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createTriggerServer(deps: TriggerServerDeps): Server {
  let state: RunState = 'idle';
  let outcome: string | null = null;
  let lines: string[] = [];

  const record = (line: string) => {
    deps.log(line);
    lines = [...lines, line].slice(-LOG_LIMIT);
  };

  const start = () => {
    state = 'running';
    outcome = null;
    lines = [];
    void (async () => {
      try {
        outcome = await deps.run(record);
        state = 'succeeded';
        record(`Outcome: ${outcome}`);
      } catch (error) {
        outcome = describeError(error);
        state = 'failed';
        record(`News agent stopped: ${outcome}`);
      }
    })();
  };

  return createServer((request, response) => {
    const origin = request.headers.origin;
    if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) {
      send(response, 403, { error: 'origin not allowed' });
      return;
    }
    if (origin !== undefined) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'origin');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET, POST');
      response.setHeader('access-control-allow-headers', TRIGGER_HEADER);
      response.writeHead(204).end();
      return;
    }
    const route = `${request.method} ${request.url}`;
    if (route === 'GET /runs/current') {
      send(response, 200, { state, outcome, lines });
      return;
    }
    if (route === 'POST /runs') {
      if (!hasTriggerHeader(request)) {
        send(response, 400, { error: `missing ${TRIGGER_HEADER} header` });
        return;
      }
      if (state === 'running') {
        send(response, 409, { error: 'a run is already in progress' });
        return;
      }
      start();
      send(response, 202, { state });
      return;
    }
    send(response, 404, { error: 'not found' });
  });
}

// A custom header forces a CORS preflight, so no page can fire this blind.
function hasTriggerHeader(request: IncomingMessage): boolean {
  return request.headers[TRIGGER_HEADER] === '1';
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
