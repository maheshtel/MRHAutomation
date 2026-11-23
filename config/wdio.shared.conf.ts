/**
 * Settings shared by every platform. The platform configs add capabilities and
 * the Appium connection; nothing here is Android- or iOS-specific.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { driver } from '@wdio/globals';
import { App } from '../src/core/app';
import { checkBackendHealth, resetAfterFailure } from '../src/core/session';
import { echoWorkerErrors, uploadFailureNow, uploadLiveArtifacts } from '../src/core/liveDiagnostics';
import { createLogger } from '../src/core/logger';
import { attachVideo, captureFailureEvidence } from '../src/core/reporting';
import { env } from './env';

const log = createLogger('runner');

/**
 * Run order for a full run. Each spec is self-contained (it sets up its own
 * preconditions), so any of them can also run alone; the order only makes a
 * full run read like a customer journey and lets later specs reuse the state
 * earlier ones leave behind instead of rebuilding it:
 *   guest specs first (navigation, cart, quantity-promotions; they must stay
 *   before Login, as they don't sign out themselves), then Login signs
 *   in and stays signed in, so Wishlist and Cleanup skip their sign-in and
 *   Logout signs out last. One sign-in per run instead of three; on a CI Mac
 *   each sign-in + sign-out costs ~2 min.
 */
const SPEC_ORDER = [
  'navigation',
  'cart',
  'quantity-promotions',
  'login',
  'wishlist',
  'cleanup',
  'logout',
] as const;

const specPath = (name: string) => `../test/specs/${name}.e2e.ts`;

/**
 * Specs for a multi-spec run. With SHARED_SESSION (default) they are one group,
 * which WebdriverIO runs in ONE worker and ONE Appium session. A new session per
 * spec file (pm clear or reinstall, UiAutomator2/WDA start, app cold start,
 * sign-in again) cost ~45 s per spec on an emulator, a third of a full run.
 * SHARED_SESSION=false restores one session per spec file.
 */
const specGroup = (names: readonly string[]) =>
  env.run.sharedSession ? [names.map(specPath)] : names.map(specPath);

/** Mocha's test object (spread into WebdriverIO hooks) carries the attempt number. */
const attemptOf = (test: unknown): number =>
  (test as { _currentRetry?: number })._currentRetry ?? 0;

export const sharedConfig: Omit<WebdriverIO.Config, 'capabilities'> = {
  runner: 'local',
  tsConfigPath: '../tsconfig.json',

  specs: specGroup(SPEC_ORDER),
  suites: {
    ...Object.fromEntries(SPEC_ORDER.map((name) => [name, [specPath(name)]])),
    smoke: specGroup(['navigation', 'cart', 'login', 'logout']),
  },

  // One device = one session at a time. Raise with MAX_INSTANCES only when
  // several devices/simulators are configured — and give each its own test
  // account, because carts and lists live on the server per account.
  maxInstances: env.run.maxInstances,

  logLevel: env.run.logLevel,
  outputDir: env.paths.logs,
  bail: 0,

  // Explicit waits only (see src/core/elements.ts).
  waitforTimeout: env.run.waitTimeout,
  waitforInterval: 300,
  // One request, one long timeout, no client-side retries. Creating the first
  // session on a fresh CI simulator/emulator (install the app, launch
  // WebDriverAgent / UiAutomator2) can legitimately take several minutes. A
  // shorter timeout plus retries made WebdriverIO abandon the in-flight
  // request and send another while Appium was still busy with the first —
  // 3 × 5 min = 15 min lost per spec file, and the retries piled load onto
  // an already slow device. Appium bounds its own startup (see
  // capabilities.ts), so one 10 min window is enough.
  connectionRetryTimeout: 600_000,
  connectionRetryCount: 0,

  // Retries, two levels:
  //  • TEST_RETRIES (default 2): a failing test is re-run inside the same
  //    session, after the app is restarted (see resetAfterFailedAttempt).
  //  • SPEC_FILE_RETRIES (default 0): the whole spec file is re-run in a
  //    brand-new session — for device/driver crashes a restart can't fix.
  //    With SHARED_SESSION the "file" is the whole group, so a retry re-runs
  //    every spec in it. It only happens when something already failed.
  specFileRetries: env.run.specFileRetries,
  specFileRetriesDeferred: true,

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: env.run.testTimeout,
    retries: env.run.retries,
  },

  reporters: [
    'spec',
    [
      'allure',
      {
        outputDir: env.paths.allureResults,
        disableWebdriverStepsReporting: true,
        disableWebdriverScreenshotsReporting: true,
        addConsoleLogs: true,
      },
    ],
    [
      'junit',
      {
        outputDir: env.paths.junit,
        outputFileFormat: ({ cid }: { cid: string }) => `results-${cid}.xml`,
      },
    ],
  ],

  /**
   * Launcher side, after each spec file's worker exits: surface why it failed
   * (worker output otherwise only lands in logs/) and, on Azure DevOps, upload
   * its logs and evidence right away (see src/core/liveDiagnostics.ts).
   */
  onWorkerEnd: (cid, exitCode) => {
    echoWorkerErrors(cid, exitCode);
    uploadLiveArtifacts(cid);
  },

  /** Runs once per session, after the app has been launched. */
  before: async () => {
    await App.configureSession();
    await App.waitUntilReady();
  },

  beforeTest: async () => {
    if (env.run.recordVideo) await driver.startRecordingScreen().catch(() => undefined);
  },

  afterTest: async (test, _context, { passed, error, duration }) => {
    const attempt = attemptOf(test);
    const title = `${test.parent} — ${test.title}${attempt > 0 ? ` (retry ${attempt})` : ''}`;
    if (!passed) {
      // Printed now (not only in the end-of-run summary) so a CI log shows the
      // reason even if the job is cut short.
      const reason = (error as Error | undefined)?.message?.split('\n')[0] ?? 'unknown error';
      log.error(`✖ ${title} after ${Math.round(duration / 1000)}s: ${reason}`);
      const evidence = await captureFailureEvidence(title, (error as Error | undefined)?.stack ?? reason);
      // Was it the test, or did the device-side automation server die? A dead
      // backend makes every lookup come back empty, so the error above then
      // names a symptom ("X not displayed"), not the cause.
      const health = await checkBackendHealth();
      if (!health.ok) {
        const diagnosis =
          `Automation backend not responding after this failure (${health.reason}). ` +
          'The device-side server (WebDriverAgent / UiAutomator2) died; the error above is a symptom.';
        log.error(`✖ ${diagnosis}`);
        appendFileSync(path.join(evidence, 'error.txt'), `\n${diagnosis}\n`, 'utf8');
      }
      uploadFailureNow(evidence);
    }
    if (env.run.recordVideo) {
      const video = await driver.stopRecordingScreen().catch(() => '');
      if (!passed && typeof video === 'string') await attachVideo(video, title);
    }
    if (!passed) await resetAfterFailedAttempt(title);
  },
};

/**
 * Reset after every failed test attempt, once the evidence above is captured.
 * Nothing that runs next may start from the screen the failure left behind (an
 * open keyboard over the tab bar, a sheet, a half-typed field): not the spec's
 * own teardown (`after` hooks), not a retry, not the next spec in a shared
 * session. Data is kept: a signed-in user stays signed in, and each scenario's
 * "Given" steps re-establish the rest. If the failure killed the automation
 * backend (WebDriverAgent / UiAutomator2), resetAfterFailure starts a fresh
 * session on a healthy device instead (src/core/session.ts).
 *
 * Here and not in beforeSuite: WebdriverIO runs the config's beforeSuite ONCE
 * per worker (a single root-suite hook), and a shared session runs every spec
 * in one worker — so a reset there never ran between specs. On 2026-11-23 an
 * open keyboard left by a failed spec failed all four specs after it.
 */
async function resetAfterFailedAttempt(title: string): Promise<void> {
  log.warn(`Resetting the app after the failure of "${title}"`);
  try {
    await resetAfterFailure();
  } catch (error) {
    // WebdriverIO would swallow it; say so, the next test will fail on its own.
    log.error(`Reset after "${title}" failed: ${(error as Error).message}`);
  }
}
