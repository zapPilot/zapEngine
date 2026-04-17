import { Worker } from "node:worker_threads";

import { defineConfig, devices } from "@playwright/test";

/**
 * Run an inline worker script synchronously using Atomics.wait.
 * Returns exit-code-style result: 0 = success, non-zero = failure.
 */
function runSyncWorker(code: string, timeoutMs: number): number {
  const sab = new SharedArrayBuffer(8);
  const view = new Int32Array(sab);
  // view[0]: 0 = pending, 1 = done
  // view[1]: result (0 = success, 1 = failure)
  Atomics.store(view, 0, 0);
  Atomics.store(view, 1, 1); // default to failure

  const wrappedCode = `
    const{workerData}=require("worker_threads");
    const view=new Int32Array(workerData.sab);
    function done(code){Atomics.store(view,1,code);Atomics.store(view,0,1);Atomics.notify(view,0)}
    ${code}
  `;

  try {
    new Worker(wrappedCode, { eval: true, workerData: { sab } });
    Atomics.wait(view, 0, 0, timeoutMs);
    return Atomics.load(view, 1);
  } catch {
    return 1;
  }
}

/**
 * Check whether a TCP port is already listening on 127.0.0.1.
 * Uses a worker thread with Atomics to avoid child_process.
 */
function isPortListening(port: number): boolean {
  return (
    runSyncWorker(
      `const s=require("net").createConnection(${port},"127.0.0.1");` +
        `s.on("connect",()=>{s.destroy();done(0)});` +
        `s.on("error",()=>done(1));`,
      2000,
    ) === 0
  );
}

/**
 * Verify the server on a port is actually this project (Zap Pilot)
 * by fetching the root page and checking for the app title in the HTML.
 */
function isZapPilotServer(port: number): boolean {
  return (
    runSyncWorker(
      `const http=require("http");` +
        `const req=http.get("http://127.0.0.1:${port}/",{timeout:3000},res=>{` +
        `let d="";res.on("data",c=>d+=c);` +
        `res.on("end",()=>done(d.includes("Zap Pilot")?0:1))});` +
        `req.on("error",()=>done(1));` +
        `req.on("timeout",()=>{req.destroy();done(1)})`,
      5000,
    ) === 0
  );
}

const DEV_PORT = 3000;
const FALLBACK_PORT = Number(process.env["PLAYWRIGHT_PORT"] ?? "3099");
const isCI = !!process.env["CI"];
const portListening = !isCI && isPortListening(DEV_PORT);
const devServerRunning = portListening && isZapPilotServer(DEV_PORT);

const activePort = devServerRunning ? DEV_PORT : FALLBACK_PORT;
const PLAYWRIGHT_BASE_URL =
  process.env["PLAYWRIGHT_BASE_URL"] ??
  `http://127.0.0.1:${activePort}`;

if (devServerRunning) {
  console.log(`♻️  Reusing existing dev server on port ${DEV_PORT}`);
} else if (portListening) {
  console.log(
    `⚠️  Port ${DEV_PORT} is in use by a different app — starting fresh dev server on port ${FALLBACK_PORT}`,
  );
} else {
  console.log(`🚀 Starting fresh dev server on port ${FALLBACK_PORT}`);
}

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: /\.spec\.ts$/,
  /* Run tests in files in parallel - disabled for memory optimization */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,
  /* Single worker for memory optimization - both CI and local */
  workers: 1,
  /* Use lightweight reporter for memory optimization */
  reporter: process.env["CI"] ? "html" : "list",
  /* Global timeout to prevent hanging tests */
  globalTimeout: 10 * 60 * 1000, // 10 minutes
  /* Test timeout */
  timeout: 30 * 1000, // 30 seconds per test
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: PLAYWRIGHT_BASE_URL,

    /* Memory optimization: disable trace collection unless needed */
    trace: "off",
    /* Memory optimization: disable video recording unless needed */
    video: "off",
    /* Memory optimization: disable screenshot on failure to save memory */
    screenshot: "off",
    /* Reduce viewport size for memory efficiency */
    viewport: { width: 1024, height: 768 },
    /* Close browser contexts quickly */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for primary DeFi browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // Uncomment for cross-browser validation when needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests.
   * When a dev server is already running on port 3000 (local dev), we skip
   * starting a second server on the same port. On CI, we always start a fresh
   * Vite server on the fallback port. */
  ...(devServerRunning
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --host 127.0.0.1 --port ${FALLBACK_PORT}`,
          url: PLAYWRIGHT_BASE_URL,
          reuseExistingServer: false,
        },
      }),
});
