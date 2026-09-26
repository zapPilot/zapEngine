import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type { AgentRunStatus } from '@zapengine/types/api';

import { describeError } from '../lib/errors.js';
import type { DemoOutcome, DemoProgress } from './demo.js';
import {
  applyProgress,
  finishRun,
  idleRunStatus,
  startRun,
} from './runStatus.js';

export interface TriggerServerDeps {
  /** The story every run reads; reported in the status. */
  episode: string;
  /** Runs one full demo, reporting timeline progress to `progress`. */
  run: (
    log: (line: string) => void,
    progress: (event: DemoProgress) => void,
  ) => Promise<DemoOutcome>;
  log: (line: string) => void;
  now: () => number;
}

const TRIGGER_HEADER = 'x-zap-trigger';
// Only the local app may trigger a run that spends real funds.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createTriggerServer(deps: TriggerServerDeps): Server {
  // Display state only, in memory: the run never reads it back.
  let status: AgentRunStatus = idleRunStatus(deps.episode);

  const start = () => {
    status = startRun(status, deps.now());
    const progress = (event: DemoProgress) => {
      status = applyProgress(status, event);
    };
    void (async () => {
      try {
        const outcome = await deps.run(deps.log, progress);
        status = finishRun(status, { outcome }, deps.now());
        deps.log(`Outcome: ${outcome}`);
      } catch (error) {
        const reason = describeError(error);
        status = finishRun(status, { error: reason }, deps.now());
        deps.log(`News agent stopped: ${reason}`);
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
      send(response, 200, status);
      return;
    }
    if (route === 'POST /runs') {
      if (!hasTriggerHeader(request)) {
        send(response, 400, { error: `missing ${TRIGGER_HEADER} header` });
        return;
      }
      if (status.state === 'running') {
        send(response, 409, status);
        return;
      }
      start();
      send(response, 202, status);
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
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}
