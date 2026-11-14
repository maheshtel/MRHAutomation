/**
 * Appium capabilities for each platform / device type.
 *
 * One builder per platform keeps every device-specific decision in a single
 * place: specs and page objects never branch on emulator vs real device.
 */
import { env } from './env';

type Caps = WebdriverIO.Capabilities & Record<`appium:${string}`, unknown>;

/** Drop undefined values so Appium never receives `"appium:udid": undefined`. */
const compact = (caps: Record<string, unknown>): Caps =>
  Object.fromEntries(Object.entries(caps).filter(([, v]) => v !== undefined)) as Caps;

export function androidCapabilities(): Caps {
  const { android, app } = env;
  const appPath = app.androidAppPath;

  return compact({
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': android.deviceName,
    'appium:udid': android.udid,
    'appium:platformVersion': android.platformVersion,

    // Emulator only: let Appium boot the AVD when none is running.
    ...(android.deviceType === 'emulator' && android.avd
      ? {
          'appium:avd': android.avd,
          'appium:avdLaunchTimeout': 240_000,
          'appium:avdReadyTimeout': 240_000,
        }
      : {}),

    // Install from a binary when one is given; otherwise drive the installed app.
    'appium:app': appPath,
    // EAS builds often share a versionCode, and Appium skips installing a binary
    // that isn't newer than the installed one — so a fresh APK would silently
    // be ignored. Always install the binary that was asked for.
    'appium:enforceAppInstall': appPath ? true : undefined,
    'appium:appPackage': app.androidPackage,
    'appium:appActivity': app.androidActivity,
    // Expo shows a splash activity theme before MainActivity is "ready".
    'appium:appWaitActivity': '*',
    'appium:appWaitDuration': 60_000,

    // Fresh state = `pm clear` at session start. Never fullReset: reinstalling
    // per spec costs minutes and gains nothing over clearing data.
    'appium:noReset': !app.freshState,
    'appium:fullReset': false,
    'appium:autoGrantPermissions': true,

    // Animations off makes waits deterministic; the app's shimmer skeletons
    // otherwise keep UiAutomator from ever seeing an idle UI.
    'appium:disableWindowAnimation': true,
    'appium:newCommandTimeout': 300,
    'appium:adbExecTimeout': 120_000,
    'appium:androidInstallTimeout': 240_000,
    'appium:uiautomator2ServerInstallTimeout': 120_000,
    'appium:uiautomator2ServerLaunchTimeout': 120_000,
    'appium:ignoreHiddenApiPolicyError': true,
  });
}

export function iosCapabilities(): Caps {
  const { ios, app } = env;
  const isReal = ios.deviceType === 'real';

  return compact({
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': ios.deviceName,
    'appium:platformVersion': ios.platformVersion,
    'appium:udid': ios.udid,

    'appium:app': app.iosAppPath,
    // Same reason as Android: reinstall even when CFBundleVersion is not newer.
    'appium:enforceAppInstall': app.iosAppPath ? true : undefined,
    'appium:bundleId': app.iosBundleId,

    'appium:noReset': !app.freshState,
    'appium:fullReset': false,
    // Accepts the push-notification permission prompt the app raises on launch.
    'appium:autoAcceptAlerts': true,

    'appium:newCommandTimeout': 300,
    // WebDriverAgent startup is bounded so a session either starts or fails
    // well inside WebdriverIO's single 10 min request window
    // (connectionRetryTimeout): 2 tries × 3 min, then a clear error.
    'appium:wdaLaunchTimeout': 180_000,
    'appium:wdaConnectionTimeout': 180_000,
    'appium:wdaStartupRetries': 2,
    'appium:wdaStartupRetryInterval': 10_000,
    'appium:simulatorStartupTimeout': 240_000,
    // React Native keeps animations running (skeleton shimmer); waiting for
    // quiescence would stall every command.
    'appium:waitForQuiescence': false,
    'appium:waitForIdleTimeout': 0,
    'appium:reduceMotion': true,

    // Simulator speed-ups (CI): no simulator window, and a prebuilt WDA that is
    // installed as-is instead of being compiled by xcodebuild.
    ...(!isReal && ios.headless ? { 'appium:isHeadless': true } : {}),
    ...(!isReal && ios.prebuiltWdaPath
      ? {
          'appium:usePreinstalledWDA': true,
          'appium:prebuiltWDAPath': ios.prebuiltWdaPath,
        }
      : {}),

    // Real device: WebDriverAgent must be code-signed.
    ...(isReal
      ? {
          'appium:xcodeOrgId': ios.xcodeOrgId,
          'appium:xcodeSigningId': ios.xcodeSigningId,
          'appium:updatedWDABundleId': ios.updatedWdaBundleId,
          'appium:allowProvisioningDeviceRegistration': true,
        }
      : {}),
  });
}
