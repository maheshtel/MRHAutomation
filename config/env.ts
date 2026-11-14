/**
 * Typed, validated access to every runtime setting.
 *
 * Resolution order (first wins): real environment variable → ENV_FILE / .env →
 * the default below. Nothing else in the suite reads `process.env` directly, so
 * a missing or malformed value fails here with a named error instead of
 * surfacing later as an `undefined` deep inside a test.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the e2e-appium folder. */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.resolve(PROJECT_ROOT, process.env.ENV_FILE ?? '.env');
if (existsSync(envFile)) {
  // `override: false` keeps real environment variables (CI secrets) in charge.
  loadDotenv({ path: envFile, override: false, quiet: true });
}

export type Platform = 'android' | 'ios';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

class ConfigError extends Error {
  constructor(message: string) {
    super(`[e2e config] ${message}`);
    this.name = 'ConfigError';
  }
}

const raw = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const str = (key: string, fallback: string): string => raw(key) ?? fallback;

const optional = (key: string): string | undefined => raw(key);

const required = (key: string, hint: string): string => {
  const value = raw(key);
  if (!value) throw new ConfigError(`${key} is not set. ${hint}`);
  return value;
};

const int = (key: string, fallback: number): number => {
  const value = raw(key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ConfigError(`${key} must be a non-negative integer, got "${value}".`);
  }
  return parsed;
};

const bool = (key: string, fallback: boolean): boolean => {
  const value = raw(key)?.toLowerCase();
  if (value === undefined) return fallback;
  if (['true', '1', 'yes'].includes(value)) return true;
  if (['false', '0', 'no'].includes(value)) return false;
  throw new ConfigError(`${key} must be true or false, got "${value}".`);
};

const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const value = (raw(key)?.toLowerCase() ?? fallback) as T;
  if (!allowed.includes(value)) {
    throw new ConfigError(`${key} must be one of ${allowed.join(' | ')}, got "${value}".`);
  }
  return value;
};

/** Resolve an app binary path relative to the project root and check it exists. */
const appPath = (key: string): string | undefined => {
  const value = optional(key);
  if (!value) return undefined;
  const resolved = path.resolve(PROJECT_ROOT, value);
  if (!existsSync(resolved)) throw new ConfigError(`${key} points to a missing file: ${resolved}`);
  return resolved;
};

export const env = {
  credentials: {
    // Read lazily: a spec that never signs in must not fail on a missing secret.
    get email(): string {
      return required('TEST_USER_EMAIL', 'Add it to e2e-appium/.env or the CI secrets.');
    },
    get password(): string {
      return required('TEST_USER_PASSWORD', 'Add it to e2e-appium/.env or the CI secrets.');
    },
  },

  testData: {
    searchTerm: str('SEARCH_TERM', 'lavender'),
    invalidCouponCode: str('INVALID_COUPON_CODE', 'E2E-NOT-A-REAL-CODE'),
  },

  app: {
    freshState: bool('FRESH_APP_STATE', true),
    androidPackage: str('APP_PACKAGE', 'com.mrh.mobilestore'),
    androidActivity: str('APP_ACTIVITY', '.MainActivity'),
    iosBundleId: str('IOS_BUNDLE_ID', 'com.mrh.mobilestore'),
    get androidAppPath() {
      return appPath('ANDROID_APP_PATH');
    },
    get iosAppPath() {
      return appPath('IOS_APP_PATH');
    },
  },

  android: {
    deviceType: oneOf('ANDROID_DEVICE_TYPE', ['emulator', 'real'] as const, 'emulator'),
    deviceName: str('ANDROID_DEVICE_NAME', 'Android Emulator'),
    udid: optional('ANDROID_UDID'),
    avd: optional('ANDROID_AVD'),
    platformVersion: optional('ANDROID_PLATFORM_VERSION'),
  },

  ios: {
    deviceType: oneOf('IOS_DEVICE_TYPE', ['simulator', 'real'] as const, 'simulator'),
    deviceName: str('IOS_DEVICE_NAME', 'iPhone 16'),
    platformVersion: optional('IOS_PLATFORM_VERSION'),
    udid: optional('IOS_UDID'),
    xcodeOrgId: optional('IOS_XCODE_ORG_ID'),
    xcodeSigningId: str('IOS_XCODE_SIGNING_ID', 'Apple Development'),
    updatedWdaBundleId: optional('IOS_UPDATED_WDA_BUNDLE_ID'),
    /** Run the simulator without its window (CI: saves CPU and memory). */
    headless: bool('IOS_HEADLESS', false),
    /**
     * A prebuilt WebDriverAgentRunner .app (simulator build). When set, Appium
     * installs and launches it directly instead of compiling WDA with
     * xcodebuild — minutes saved on every fresh CI agent.
     */
    get prebuiltWdaPath() {
      return appPath('IOS_PREBUILT_WDA_PATH');
    },
    /**
     * DerivedData folder holding a WebDriverAgent already compiled with
     * `xcodebuild build-for-testing` (scripts/ci/build-wda.sh). When set,
     * Appium only launches WDA (test-without-building) instead of compiling it
     * inside the first session.
     */
    get wdaDerivedDataPath() {
      return appPath('IOS_WDA_DERIVED_DATA_PATH');
    },
    /** Stream xcodebuild's output into the Appium log (CI: explains WDA failures). */
    showXcodeLog: bool('IOS_SHOW_XCODE_LOG', false),
  },

  appium: {
    start: bool('START_APPIUM', true),
    host: str('APPIUM_HOST', '127.0.0.1'),
    port: int('APPIUM_PORT', 4723),
    path: str('APPIUM_PATH', '/'),
  },

  run: {
    waitTimeout: int('WAIT_TIMEOUT', 30_000),
    // Per attempt. The signed-in wishlist journey makes ~20 server round-trips.
    testTimeout: int('TEST_TIMEOUT', 600_000),
    // A failing test is re-run up to this many times (after an app restart)
    // before it is reported as failed.
    retries: int('TEST_RETRIES', 2),
    specFileRetries: int('SPEC_FILE_RETRIES', 0),
    maxInstances: Math.max(1, int('MAX_INSTANCES', 1)),
    logLevel: oneOf(
      'LOG_LEVEL',
      ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const,
      'warn',
    ) as LogLevel,
    recordVideo: bool('RECORD_VIDEO', false),
    // GitHub Actions sets CI; Azure DevOps sets TF_BUILD.
    isCI: bool('CI', false) || bool('TF_BUILD', false),
  },

  paths: {
    reports: path.join(PROJECT_ROOT, 'reports'),
    allureResults: path.join(PROJECT_ROOT, 'reports', 'allure-results'),
    junit: path.join(PROJECT_ROOT, 'reports', 'junit'),
    artifacts: path.join(PROJECT_ROOT, 'reports', 'artifacts'),
    logs: path.join(PROJECT_ROOT, 'logs'),
  },
} as const;

/** Fail fast on device settings that cannot work, before a session is requested. */
export function validatePlatform(platform: Platform): void {
  if (platform === 'android' && env.android.deviceType === 'real' && !env.android.udid) {
    throw new ConfigError('ANDROID_DEVICE_TYPE=real requires ANDROID_UDID (see `adb devices`).');
  }
  if (platform === 'ios' && env.ios.deviceType === 'real') {
    if (!env.ios.udid) {
      throw new ConfigError(
        'IOS_DEVICE_TYPE=real requires IOS_UDID (see `xcrun xctrace list devices`).',
      );
    }
    if (!env.ios.xcodeOrgId) {
      throw new ConfigError(
        'IOS_DEVICE_TYPE=real requires IOS_XCODE_ORG_ID to sign WebDriverAgent.',
      );
    }
  }
}
