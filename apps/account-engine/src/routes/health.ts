import { Hono } from 'hono';

export function createHealthRoutes() {
  const app = new Hono();

  app.get('/', (c) =>
    c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'account-engine',
    }),
  );

  return app;
}
