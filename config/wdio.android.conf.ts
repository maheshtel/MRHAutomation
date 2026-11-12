/**
 * Android — emulator or real device.
 *   npm run test:android
 * Device selection comes from .env: ANDROID_DEVICE_TYPE, ANDROID_UDID, ANDROID_AVD.
 */
import { appiumConnection } from './appium';
import { androidCapabilities } from './capabilities';
import { validatePlatform } from './env';
import { sharedConfig } from './wdio.shared.conf';

validatePlatform('android');

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  ...appiumConnection(),
  capabilities: [androidCapabilities()],
};
