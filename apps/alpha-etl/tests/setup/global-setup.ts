import { beforeAll, afterAll, vi } from 'vitest';
import { config } from 'dotenv';
import path from 'path';
import express from 'express';
import { Server as TlsServer } from 'tls';
import { createRequire } from 'module';
import request from '../utils/inMemoryRequest.js';

const TEST_HOST = '127.0.0.1';

// Load test-specific environment variables before any test modules import app/config.
config({ path: path.resolve(process.cwd(), '.env.test') });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.MOCK_APIS = 'true';
process.env.HOST = TEST_HOST;
// Prevent .env placeholders from enabling webhook auth in tests.
process.env.WEBHOOK_SECRET = '';

const originalListen = express.application.listen;
express.application.listen = function (...args: Parameters<typeof originalListen>) {
  const listenArgs = [...args] as unknown[];

  if (typeof listenArgs[0] === 'number') {
    if (listenArgs.length === 1) {
      listenArgs.push(TEST_HOST);
    } else if (typeof listenArgs[1] !== 'string') {
      listenArgs.splice(1, 0, TEST_HOST);
    }
  }

  return originalListen.apply(this, listenArgs as Parameters<typeof originalListen>);
};

const require = createRequire(import.meta.url);
const SupertestTest = require('supertest/lib/test');
SupertestTest.prototype.serverAddress = function (app: express.Application, path: string) {
  const addr = app.address();

  if (!addr) {
    this._server = app.listen(0, TEST_HOST);
  }

  const port = app.address().port;
  const protocol = app instanceof TlsServer ? 'https' : 'http';

  return `${protocol}://${TEST_HOST}:${port}${path}`;
};

vi.mock('supertest', () => ({
  default: request
}));

beforeAll(() => {
  // Reserved for future global setup needs.
});

afterAll(() => {
  // Global cleanup if needed
});
