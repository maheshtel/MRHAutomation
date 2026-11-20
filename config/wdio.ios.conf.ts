/**
 * iOS — simulator or real device (macOS + Xcode required).
 *   npm run test:ios
 * Device selection comes from .env: IOS_DEVICE_TYPE, IOS_DEVICE_NAME,
 * IOS_PLATFORM_VERSION, IOS_UDID (+ signing settings for real devices).
 */
import { controllableSimulatorUdid, rebootSimulator } from '../src/core/simulator';
import { appiumConnection } from './appium';
import { iosCapabilities } from './capabilities';
import { validatePlatform } from './env';
import { sharedConfig } from './wdio.shared.conf';

validatePlatform('ios');

/** Spec groups that already had a worker: a second worker for one is a spec-file retry. */
const startedSpecGroups = new Set<string>();

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  ...appiumConnection(),
  capabilities: [iosCapabilities()],

  /**
   * Launcher side, before each worker. A spec-file retry (SPEC_FILE_RETRIES)
   * means the previous worker failed — possibly because the simulator itself
   * broke (its system UI died and WebDriverAgent cannot start on it). A new
   * session on that device hangs for the whole 10 min connection window, so
   * the retry starts on a freshly rebooted simulator instead.
   */
  onWorkerStart: (_cid, _caps, specs) => {
    const key = specs.join('|');
    const udid = controllableSimulatorUdid();
    if (startedSpecGroups.has(key) && udid) rebootSimulator(udid);
    startedSpecGroups.add(key);
  },
};
