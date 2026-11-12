/**
 * Settings shared by every platform. The platform configs add capabilities and
 * the Appium connection; nothing here is Android- or iOS-specific.
 */
import { driver } from '@wdio/globals';
import { App } from '../src/core/app';
import { createLogger } from '../src/core/logger';
import { attachVideo, captureFailureEvidence } from '../src/core/reporting';
import { env } from './env';

const log = createLogger('runner');

/**
 * Run order for a full run. Each spec is self-contained (it sets up its own
 * preconditions), so any of them can also run alone; the order only makes a
 * full run read like a customer journey and lets Cleanup reuse the state the
 * Wishlist scenario leaves behind instead of rebuilding it.
 */
const SPEC_ORDER = [
  'login',
  'navigation',
  'cart',
  'quantity-promotions',
  'wishlist',
  'cleanup',
  'logout',
] as const;

const specPath = (name: string) => `../test/specs/${name}.e2e.ts`;

/** Mocha's test object (spread into WebdriverIO hooks) carries the attempt number. */
const attemptOf = (test: unknown): number =>
  (test as { _currentRetry?: number })._currentRetry ?? 0;

export const sharedConfig: Omit<WebdriverIO.Config, 'capabilities'> = {
  runner: 'local',
  tsConfigPath: '../tsconfig.json',

  specs: SPEC_ORDER.map(specPath),
  suites: {
    ...Object.fromEntries(SPEC_ORDER.map((name) => [name, [specPath(name)]])),
    smoke: ['login', 'navigation', 'cart', 'logout'].map(specPath),
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
  connectionRetryTimeout: 300_000,
  connectionRetryCount: 2,

  // Retries, two levels:
  //  • TEST_RETRIES (default 2): a failing test is re-run inside the same
  //    session, after the app is restarted (see beforeTest below).
  //  • SPEC_FILE_RETRIES (default 0): the whole spec file is re-run in a
  //    brand-new session — for device/driver crashes a restart can't fix.
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

  /** Runs once per session, after the app has been launched. */
  before: async () => {
    await App.configureSession();
    await App.waitUntilReady();
  },

  /**
   * Runs before every attempt of every test. A retry must not start from the
   * screen the failed attempt left behind (an open sheet, a half-typed field),
   * so the app is restarted first. Data is kept: a signed-in user stays signed
   * in, and the scenario's own "Given" steps re-establish the rest.
   */
  beforeTest: async (test) => {
    const attempt = attemptOf(test);
    if (attempt > 0) {
      log.warn(`Retry ${attempt}/${env.run.retries} of "${test.title}" — restarting the app`);
      await App.restart();
    }
    if (env.run.recordVideo) await driver.startRecordingScreen().catch(() => undefined);
  },

  afterTest: async (test, _context, { passed }) => {
    const attempt = attemptOf(test);
    const title = `${test.parent} — ${test.title}${attempt > 0 ? ` (retry ${attempt})` : ''}`;
    if (!passed) await captureFailureEvidence(title);
    if (env.run.recordVideo) {
      const video = await driver.stopRecordingScreen().catch(() => '');
      if (!passed && typeof video === 'string') await attachVideo(video, title);
    }
  },
};
