#!/usr/bin/env node

import { chromium } from '@playwright/test';

const DEFAULT_URLS = [
  'http://127.0.0.1:3005/',
  'http://127.0.0.1:3000/',
  'http://127.0.0.1:3001/',
];

const args = process.argv.slice(2);
const allowMissingBrowser = args.includes('--allow-missing-browser');
const urlArgs = args.filter((arg) => !arg.startsWith('--'));
const envUrls = (process.env['ZAP_VITE_HEALTH_URL'] ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const explicitUrls = [...envUrls, ...urlArgs];
const urls = explicitUrls.length > 0 ? explicitUrls : DEFAULT_URLS;

function isViteOptimizedDepUrl(url) {
  return url.includes('/node_modules/.vite/deps/');
}

function isViteDevLoadError(text) {
  return (
    /Outdated Optimize Dep/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Loading chunk .* failed/i.test(text)
  );
}

async function canProbeUrl(url, explicit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
    });
    const html = await response.text();
    return (
      explicit ||
      html.includes('/@vite/client') ||
      html.includes('Zap Pilot') ||
      html.includes('type="module"')
    );
  } catch (error) {
    if (explicit) {
      throw new Error(`Could not reach ${url}: ${error.message}`);
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkUrl(browser, url) {
  const page = await browser.newPage();
  const issues = [];
  const pendingResponseChecks = [];

  page.on('response', (response) => {
    const responseUrl = response.url();
    const status = response.status();

    if (isViteOptimizedDepUrl(responseUrl) && status >= 400) {
      issues.push(`${status} ${responseUrl}`);
    }

    if (status === 504 || isViteOptimizedDepUrl(responseUrl)) {
      pendingResponseChecks.push(
        (async () => {
          try {
            const body = await response.text();
            if (isViteDevLoadError(body)) {
              issues.push(`${status} ${responseUrl}: ${body.slice(0, 200)}`);
            }
          } catch {
            return;
          }
        })(),
      );
    }
  });

  page.on('requestfailed', (request) => {
    const requestUrl = request.url();
    const type = request.resourceType();
    const failure = request.failure()?.errorText ?? 'request failed';

    if (isViteOptimizedDepUrl(requestUrl) || type === 'script') {
      issues.push(`${failure} ${requestUrl}`);
    }
  });

  page.on('console', (message) => {
    if (message.type() === 'error' && isViteDevLoadError(message.text())) {
      issues.push(`console: ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    if (isViteDevLoadError(error.message)) {
      issues.push(`pageerror: ${error.message}`);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Long-polling app/API calls are fine here; the target is Vite asset load.
    }
    await page.waitForTimeout(750);
    await Promise.allSettled(pendingResponseChecks);
  } finally {
    await page.close();
  }

  return issues;
}

async function main() {
  const explicit = explicitUrls.length > 0;
  const urlsToCheck = [];

  for (const url of urls) {
    if (await canProbeUrl(url, explicit)) {
      urlsToCheck.push(url);
    }
  }

  if (urlsToCheck.length === 0) {
    console.log(
      'No running Vite dev server detected; skipping dev health check.',
    );
    return;
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    if (allowMissingBrowser) {
      console.log(
        `Playwright browser unavailable; skipping dev health check: ${error.message}`,
      );
      return;
    }
    throw error;
  }

  const failures = [];
  try {
    for (const url of urlsToCheck) {
      const issues = await checkUrl(browser, url);
      if (issues.length > 0) {
        failures.push({ url, issues });
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Vite dev health check failed for ${failure.url}`);
      for (const issue of failure.issues.slice(0, 10)) {
        console.error(`- ${issue}`);
      }
    }
    process.exit(1);
  }

  console.log(`Vite dev health check passed: ${urlsToCheck.join(', ')}`);
}

main().catch((error) => {
  console.error(`Vite dev health check failed: ${error.message}`);
  process.exit(1);
});
