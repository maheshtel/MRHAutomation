import { driver } from '@wdio/globals';

export const isAndroid = (): boolean => driver.isAndroid;
export const isIOS = (): boolean => driver.isIOS;

/** Pick a value per platform: `onPlatform({ android: a, ios: b })`. */
export function onPlatform<T>(values: { android: T; ios: T }): T {
  return isAndroid() ? values.android : values.ios;
}
