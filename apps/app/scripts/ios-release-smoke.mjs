#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncIosNative } from './sync-ios-native.mjs';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const resultsRoot = resolve(appRoot, 'test-results', 'ios-release-smoke');
const workspacePath = resolve(appRoot, 'ios', 'ZapPilot.xcworkspace');
const fatalPattern =
  /NativeModule:.*(?:null|not found)|Unhandled JS Exception|RCTFatal|Terminating app due to uncaught exception|No script URL provided/iu;

function capture(command, args, { cwd = appRoot, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function runLogged(
  command,
  args,
  { cwd = appRoot, env = process.env, logPath, allowFailure = false } = {},
) {
  mkdirSync(dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, 'a');
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);

  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed; see ${logPath}`);
  }
  return result;
}

function runLoggedStreaming(
  command,
  args,
  {
    cwd = appRoot,
    env = process.env,
    logPath,
    allowFailure = false,
    heartbeatLabel = command,
  } = {},
) {
  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: 'a' });
  const startedAt = Date.now();

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;

    const heartbeat = setInterval(() => {
      const elapsedMinutes = Math.max(
        1,
        Math.floor((Date.now() - startedAt) / 60_000),
      );
      console.log(`${heartbeatLabel} is still running (${elapsedMinutes}m)...`);
    }, 60_000);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      logStream.end(() => {
        if (error) rejectPromise(error);
        else resolvePromise(result);
      });
    }

    child.stdout.on('data', (chunk) => {
      logStream.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      logStream.write(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (error) => finish(error));
    child.on('close', (status, signal) => {
      const result = { status, signal };
      if (!allowFailure && status !== 0) {
        finish(
          new Error(`${command} ${args.join(' ')} failed; see ${logPath}`),
          result,
        );
        return;
      }
      finish(undefined, result);
    });
  });
}

function runtimeVersion(runtime) {
  const match = /iOS-(\d+)(?:-(\d+))?/u.exec(runtime);
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : [0, 0];
}

function compareVersions(left, right) {
  return right[0] - left[0] || right[1] - left[1];
}

function selectSimulator() {
  const result = capture('xcrun', [
    'simctl',
    'list',
    'devices',
    'available',
    '-j',
  ]);
  if (result.status !== 0) {
    throw new Error(`Unable to list iOS simulators:\n${result.stderr}`);
  }

  const runtimes = Object.entries(JSON.parse(result.stdout).devices)
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .sort(([left], [right]) =>
      compareVersions(runtimeVersion(left), runtimeVersion(right)),
    );

  for (const [runtime, devices] of runtimes) {
    const iPhones = devices.filter(
      (device) =>
        device.isAvailable !== false && device.name.startsWith('iPhone'),
    );
    const device =
      iPhones.find((candidate) => candidate.state === 'Booted') ??
      iPhones.find((candidate) => candidate.name.includes('Pro')) ??
      iPhones[0];
    if (device) return { ...device, runtime };
  }

  throw new Error('No available iPhone Simulator runtime was found.');
}

function readPlistValue(plistPath, key) {
  const result = capture('/usr/bin/plutil', [
    '-extract',
    key,
    'raw',
    '-o',
    '-',
    plistPath,
  ]);
  if (result.status !== 0) {
    throw new Error(
      `Unable to read ${key} from ${plistPath}: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function findBuiltApp(derivedDataPath) {
  const productsRoot = join(
    derivedDataPath,
    'Build',
    'Products',
    'Release-iphonesimulator',
  );
  const expected = join(productsRoot, 'ZapPilot.app');
  if (existsSync(expected)) return expected;

  const fallback = readdirSync(productsRoot, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith('.app'),
  );
  if (fallback) return join(productsRoot, fallback.name);
  throw new Error(`No Release simulator .app was produced in ${productsRoot}.`);
}

function readIfPresent(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('The iOS Release smoke test requires macOS.');
  }

  rmSync(resultsRoot, { recursive: true, force: true });
  mkdirSync(resultsRoot, { recursive: true });

  const prebuildLog = join(resultsRoot, 'prebuild-and-pods.log');
  const xcodebuildLog = join(resultsRoot, 'xcodebuild.log');
  const simulatorLog = join(resultsRoot, 'simulator.log');
  const launchLog = join(resultsRoot, 'launch.log');
  const stdoutLog = join(resultsRoot, 'app.stdout.log');
  const stderrLog = join(resultsRoot, 'app.stderr.log');
  const screenshotPath = join(resultsRoot, 'cold-start.png');
  const resultBundlePath = join(resultsRoot, 'build.xcresult');
  const derivedDataPath = mkdtempSync(join(tmpdir(), 'zappilot-ios-smoke-'));

  let bootedByTest = false;
  let simulator;

  try {
    console.log('1/4 Synchronizing iOS native dependencies...');
    syncIosNative({
      clean: process.env.CI === 'true' || process.env.CI === '1',
      logPath: prebuildLog,
    });

    console.log('2/4 Selecting an iPhone Simulator...');
    simulator = selectSimulator();
    writeFileSync(
      join(resultsRoot, 'simulator.json'),
      `${JSON.stringify(simulator, null, 2)}\n`,
    );
    if (simulator.state !== 'Booted') {
      runLogged('xcrun', ['simctl', 'boot', simulator.udid], {
        logPath: simulatorLog,
      });
      bootedByTest = true;
    }
    runLogged('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], {
      logPath: simulatorLog,
    });

    console.log(
      '3/4 Building the real Release app with embedded JavaScript...',
    );
    await runLoggedStreaming(
      'xcodebuild',
      [
        '-workspace',
        workspacePath,
        '-scheme',
        'ZapPilot',
        '-configuration',
        'Release',
        '-sdk',
        'iphonesimulator',
        '-destination',
        `platform=iOS Simulator,id=${simulator.udid}`,
        '-derivedDataPath',
        derivedDataPath,
        '-resultBundlePath',
        resultBundlePath,
        '-quiet',
        'ONLY_ACTIVE_ARCH=YES',
        'COMPILER_INDEX_STORE_ENABLE=NO',
        'CODE_SIGNING_ALLOWED=NO',
        'build',
      ],
      {
        logPath: xcodebuildLog,
        heartbeatLabel: 'iOS Release xcodebuild',
      },
    );

    const appPath = findBuiltApp(derivedDataPath);
    const infoPlistPath = join(appPath, 'Info.plist');
    const bundleIdentifier = readPlistValue(
      infoPlistPath,
      'CFBundleIdentifier',
    );
    const executableName = readPlistValue(infoPlistPath, 'CFBundleExecutable');
    const executablePath = join(appPath, executableName);
    const executableStrings = capture('/usr/bin/strings', [executablePath]);
    if (
      executableStrings.status !== 0 ||
      !executableStrings.stdout.includes('RNCAsyncStorage')
    ) {
      throw new Error(
        'Release executable is missing RNCAsyncStorage; refusing to launch a JS/native-mismatched app.',
      );
    }

    console.log('4/4 Installing and cold-launching the Release app...');
    runLogged(
      'xcrun',
      ['simctl', 'uninstall', simulator.udid, bundleIdentifier],
      {
        logPath: simulatorLog,
        allowFailure: true,
      },
    );
    runLogged('xcrun', ['simctl', 'install', simulator.udid, appPath], {
      logPath: simulatorLog,
    });
    writeFileSync(stdoutLog, '');
    writeFileSync(stderrLog, '');
    const launchResult = capture('xcrun', [
      'simctl',
      'launch',
      '--terminate-running-process',
      `--stdout=${stdoutLog}`,
      `--stderr=${stderrLog}`,
      simulator.udid,
      bundleIdentifier,
    ]);
    writeFileSync(launchLog, `${launchResult.stdout}${launchResult.stderr}`);
    if (launchResult.status !== 0) {
      throw new Error(`Release app failed to launch; see ${launchLog}.`);
    }

    await wait(15_000);
    runLogged(
      'xcrun',
      [
        'simctl',
        'spawn',
        simulator.udid,
        'log',
        'show',
        '--last',
        '1m',
        '--style',
        'compact',
        '--info',
        '--debug',
        '--predicate',
        `process == "${executableName}" OR eventMessage CONTAINS[c] "${bundleIdentifier}"`,
      ],
      { logPath: simulatorLog, allowFailure: true },
    );
    runLogged(
      'xcrun',
      ['simctl', 'io', simulator.udid, 'screenshot', screenshotPath],
      { logPath: simulatorLog },
    );

    const termination = runLogged(
      'xcrun',
      ['simctl', 'terminate', simulator.udid, bundleIdentifier],
      { logPath: simulatorLog, allowFailure: true },
    );
    const collectedLogs = [
      readIfPresent(stdoutLog),
      readIfPresent(stderrLog),
      readIfPresent(simulatorLog),
    ].join('\n');

    if (termination.status !== 0) {
      throw new Error(
        'Release app was no longer running after 15 seconds; it likely crashed during cold start.',
      );
    }
    const fatalMatch = fatalPattern.exec(collectedLogs);
    if (fatalMatch) {
      throw new Error(
        `Release app emitted a fatal startup signature: ${fatalMatch[0]}`,
      );
    }

    writeFileSync(
      join(resultsRoot, 'summary.txt'),
      [
        'PASS',
        `Simulator: ${simulator.name} (${simulator.runtime})`,
        `Bundle: ${bundleIdentifier}`,
        'Cold-start survival: 15 seconds',
        'Linked native module: RNCAsyncStorage',
        '',
      ].join('\n'),
    );
    console.log(`iOS Release cold-start smoke passed: ${resultsRoot}`);
  } finally {
    rmSync(derivedDataPath, { recursive: true, force: true });
    if (bootedByTest && simulator) {
      runLogged('xcrun', ['simctl', 'shutdown', simulator.udid], {
        logPath: simulatorLog,
        allowFailure: true,
      });
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(`iOS smoke artifacts: ${resultsRoot}`);
  process.exit(1);
}
