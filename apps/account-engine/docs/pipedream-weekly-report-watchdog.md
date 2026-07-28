# Pipedream Weekly Report Watchdog

The weekly Pipedream workflow has three steps:

1. A weekly trigger.
2. An authenticated `POST https://account-engine.fly.dev/jobs/weekly-report/batch` request.
3. The Node.js watchdog component below.

The watchdog follows the accepted parent job until every child finishes. This
keeps the external workflow watching for an in-memory job that disappears
after fan-out, while account-engine's `[ALERT] Job Failure` email still reports
ordinary permanent child failures.

```js
import axios from 'axios';

const POLL_INTERVAL_MS = 5_000;
const COMPLETION_TIMEOUT_MS = 10 * 60_000;

export default defineComponent({
  async run({ steps }) {
    const customRequestResult = steps.custom_request.$return_value;
    const responseBody = customRequestResult?.data ?? customRequestResult;
    const jobId = responseBody?.job?.id;

    if (!jobId) {
      throw new Error('Weekly report request did not return job.id');
    }

    const deadline = Date.now() + COMPLETION_TIMEOUT_MS;

    while (Date.now() < deadline) {
      let jobData;

      try {
        const response = await axios({
          method: 'GET',
          url: `https://account-engine.fly.dev/jobs/${jobId}`,
          timeout: 15_000,
        });
        jobData = response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          throw new Error(
            `Weekly report job state lost: ${jobId} was accepted but is no longer available`,
          );
        }

        throw error;
      }

      if (jobData.status === 'completed') {
        return {
          jobId,
          status: jobData.status,
          progress: jobData.progress,
        };
      }

      if (jobData.status === 'failed') {
        throw new Error(
          `Weekly report job ${jobId} failed: ${jobData.errorMessage ?? 'unknown error'}`,
        );
      }

      if (jobData.status !== 'pending' && jobData.status !== 'processing') {
        throw new Error(
          `Weekly report job ${jobId} returned unknown status: ${jobData.status}`,
        );
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remainingMs)),
        );
      }
    }

    throw new Error(
      `Weekly report job did not complete within 10 minutes: ${jobId}`,
    );
  },
});
```

## Required workflow notification

Configure Pipedream to notify the administrator when this workflow throws an
error. This is required for the 404 and timeout checks to become alerts; a red
workflow step alone is not an operational notification.

## Acceptance checks

Test the watchdog with mocked status responses before publishing the workflow:

- `pending`, `processing`, then `completed` succeeds.
- `completed` on the first poll succeeds.
- `failed` throws and includes `errorMessage`.
- HTTP 404 before or after fan-out throws a `job state lost` error.
- A non-terminal job at ten minutes throws a completion-timeout error.

Do not remove the watchdog until the account-engine job queue and status lookup
are durable across Fly restarts and multiple machines.
