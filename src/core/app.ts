/**
 * App lifecycle: session tuning, readiness, restarts and system dialogs.
 */
import { $, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { createLogger } from './logger';
import { by } from './locators';
import { isAndroid } from './platform';

const log = createLogger('app');

/** Splash + discovery + first content fetch. Generous on purpose: cold starts on CI emulators are slow. */
const APP_READY_TIMEOUT = 120_000;

/** Android 13+ runtime permission dialog (POST_NOTIFICATIONS on first launch). */
const ANDROID_PERMISSION_ALLOW =
  'android=new UiSelector().resourceIdMatches(".*:id/permission_allow_button")';

/** System "<app> isn't responding" dialog → its "Wait" button. */
const ANDROID_ANR_WAIT = 'android=new UiSelector().resourceId("android:id/aerr_wait")';

/** The Home tab is present on every screen once the app has painted. */
const homeTab = () => by.label('Home tab');

export const App = {
  appId(): string {
    return isAndroid() ? env.app.androidPackage : env.app.iosBundleId;
  },

  /**
   * Session-level settings. UiAutomator2 and XCUITest both wait for the UI to
   * go idle before every command; React Native's looping skeleton animations
   * mean it never does, so every command would pay the full idle timeout.
   *
   * Android `waitForSelectorTimeout`: when a cached element goes stale (a sheet
   * or overlay that just closed), UiAutomator2 re-finds it through its
   * UiSelector and waits up to this long (default 10 s) before answering
   * "stale". Every wait in this suite polls explicitly (src/core/elements.ts),
   * so that built-in wait only added ~11 s to each check of a vanished element.
   */
  async configureSession(): Promise<void> {
    try {
      await driver.updateSettings(
        isAndroid()
          ? { waitForIdleTimeout: 100, waitForSelectorTimeout: 0 }
          : {
              waitForIdleTimeout: 0,
              animationCoolOffTimeout: 0,
              // Computing `visible` is the most expensive part of an iOS page
              // source (41 s per Home read on a busy CI Mac). pageSource.ts judges
              // on-screen by frame instead, so leave it out.
              pageSourceExcludedAttributes: 'visible',
            },
      );
    } catch (error) {
      log.warn('Could not apply session settings', error);
    }
  },

  /** Wait until the tab bar is interactive, accepting first-launch dialogs. */
  async waitUntilReady(timeout = APP_READY_TIMEOUT): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await App.dismissSystemDialogs();
      if (
        await $(homeTab())
          .isDisplayed()
          .catch(() => false)
      ) {
        log.info('App is ready');
        return;
      }
      await driver.pause(500);
    }
    throw new Error(`App did not become ready within ${timeout / 1000}s (Home tab never appeared)`);
  },

  /**
   * Clear system dialogs that cover the app: the notification-permission
   * prompt, and Android's "<app> isn't responding" dialog that busy CI
   * emulators raise for system apps (tapping Wait leaves everything running).
   * Never throws.
   */
  async dismissSystemDialogs(): Promise<void> {
    try {
      if (isAndroid()) {
        const allow = await $(ANDROID_PERMISSION_ALLOW);
        if (await allow.isDisplayed().catch(() => false)) {
          log.info('Accepting Android permission dialog');
          await allow.click();
        }
        const wait = await $(ANDROID_ANR_WAIT);
        if (await wait.isDisplayed().catch(() => false)) {
          log.warn('Dismissing an Android "isn\'t responding" dialog (Wait)');
          await wait.click();
        }
      } else if (env.ios.deviceType === 'real') {
        // autoAcceptAlerts covers this; this is the fallback for real devices
        // where a provisional prompt can slip through. Not on simulators: there
        // each attempt costs 1–2 s on a CI Mac and never finds an alert.
        await driver.execute('mobile: alert', { action: 'accept' }).catch(() => undefined);
      }
    } catch {
      // No dialog — nothing to do.
    }
  },

  /** Terminate and relaunch the app, keeping its data. */
  async restart(): Promise<void> {
    await driver.terminateApp(App.appId());
    await driver.activateApp(App.appId());
    await App.waitUntilReady();
  },

  /** Open a deep link (e.g. `mrhstorefrontapp://`) in this app. */
  async openDeepLink(url: string): Promise<void> {
    await driver.deepLink(url, App.appId());
  },
};
