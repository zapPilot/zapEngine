import type { AppServices } from '@container';
import { createEtlRoutes } from '@routes/etl';
import { Hono } from 'hono';

function createServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    usersService: {
      getEtlJobStatus: jest
        .fn()
        .mockResolvedValue({ job_id: 'etl-1', status: 'completed' }),
    },
    ...overrides,
  } as unknown as AppServices;
}

function createApp(services: AppServices) {
  const app = new Hono();
  app.route('/etl', createEtlRoutes(services));
  return app;
}

describe('GET /etl/jobs/:jobId', () => {
  it('returns 200 with ETL job status', async () => {
    const services = createServices();
    const response = await createApp(services).request(
      'http://localhost/etl/jobs/etl-job-123',
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job_id: 'etl-1',
      status: 'completed',
    });
    expect(services.usersService.getEtlJobStatus).toHaveBeenCalledWith(
      'etl-job-123',
    );
  });

  it('returns 400 for a missing jobId (empty param)', async () => {
    const services = createServices();
    // Route doesn't match without :jobId
    const response = await createApp(services).request(
      'http://localhost/etl/jobs/',
    );
    expect(response.status).toBe(404);
  });
});
