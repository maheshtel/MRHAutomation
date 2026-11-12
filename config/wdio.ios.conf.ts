/**
 * iOS — simulator or real device (macOS + Xcode required).
 *   npm run test:ios
 * Device selection comes from .env: IOS_DEVICE_TYPE, IOS_DEVICE_NAME,
 * IOS_PLATFORM_VERSION, IOS_UDID (+ signing settings for real devices).
 */
import { appiumConnection } from './appium';
import { iosCapabilities } from './capabilities';
import { validatePlatform } from './env';
import { sharedConfig } from './wdio.shared.conf';

validatePlatform('ios');

export const config: WebdriverIO.Config = {
  ...sharedConfig,
  ...appiumConnection(),
  capabilities: [iosCapabilities()],
};
