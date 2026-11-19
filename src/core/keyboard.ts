/**
 * Getting past the on-screen keyboard WITHOUT accidentally pressing its
 * return key.
 *
 * In this app every single-line field's return key runs `onSubmitEditing`:
 *   - password      (returnKeyType "done") → handleLogin   (same as "SIGN IN")
 *   - coupon code   (returnKeyType "next") → apply()       (same as "Apply")
 *   - wishlist name (returnKeyType "done") → handleSubmit  (same as "Create")
 *   - search                                → commit()      (leaves the typeahead)
 *
 * XCUITest has no key-free "hide keyboard" on iPhone: `driver.hideKeyboard()` /
 * `mobile: hideKeyboard` always tap a key. So "hide the keyboard, then tap the
 * button" submits the form via the keyboard and then waits for a button that
 * has already gone, or double-submits.
 *
 * Instead the button is tapped with the keyboard still open. Every scroll
 * container in the app sets `keyboardShouldPersistTaps="handled"`, so that one
 * tap both dismisses the keyboard and presses the button — exactly what a
 * user does.
 */
import { $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { isShown, waitForDisplayed, type WaitOptions } from './elements';
import { swipe } from './gestures';
import { createLogger } from './logger';
import type { Selector } from './locators';
import { isAndroid } from './platform';

const log = createLogger('keyboard');

/** Pixels kept between the target's bottom edge and the keyboard. */
const CLEARANCE = 4;

export interface TapPastKeyboardOptions extends WaitOptions {
  /**
   * Label of the focused field's return key (its React Native `returnKeyType`:
   * "done", "next", "go"…) when that key performs the very same action as this
   * button. If the button is covered by the keyboard, that key is pressed
   * instead — the same submit a user gets from the keyboard.
   */
  returnKey?: string;
}

/** Android: BACK closes the keyboard and never submits anything. No-op on iOS. */
export async function hideAndroidKeyboard(): Promise<void> {
  if (!isAndroid()) return; // iOS can only "hide" by pressing a key — see above
  try {
    if (await driver.isKeyboardShown()) await driver.hideKeyboard();
  } catch {
    // Keyboard already gone — nothing to do.
  }
}

/** Top edge of the iOS keyboard, or undefined when it is not on screen. */
async function iosKeyboardTop(): Promise<number | undefined> {
  const keyboards = await $$('-ios class chain:**/XCUIElementTypeKeyboard').getElements();
  for (const keyboard of keyboards) {
    const { y, height } = await driver.getElementRect(keyboard.elementId);
    if (height > 0) return y;
  }
  return undefined;
}

async function bottomOf(element: WebdriverIO.Element): Promise<number | undefined> {
  try {
    const { y, height } = await driver.getElementRect(element.elementId);
    return y + height;
  } catch {
    return undefined; // went stale between the find and the read
  }
}

/** Tap the iOS keyboard key labelled `label` (case-insensitive). */
async function pressIosKey(label: string): Promise<void> {
  const key = label.replace(/"/g, '');
  const matches = await $$(
    `-ios class chain:**/XCUIElementTypeKeyboard/**/*[\`name ==[c] "${key}" OR label ==[c] "${key}"\`]`,
  ).getElements();
  if (matches.length > 0) {
    await matches[matches.length - 1].click();
    return;
  }
  const capitalised = key.charAt(0).toUpperCase() + key.slice(1);
  await driver.execute('mobile: hideKeyboard', { keys: [key, capitalised] });
}

/**
 * Tap a control that follows text entry (Sign in, Apply, Create) without first
 * pressing the keyboard's return key.
 *
 * Android: hide the keyboard with BACK, then tap.
 *
 * iOS: tap straight through the open keyboard when the control is above it.
 * A control UNDER the keyboard is reported not visible by XCUITest, so it must
 * not be waited for as "displayed" (that timed out on the wishlist sheet's
 * Create button). Instead:
 *   - `returnKey` given → press that key: in this app it runs the very same
 *     handler as the button;
 *   - otherwise drag the content above the keyboard upwards (a drag presses
 *     no key) to lift the control into view, then tap it.
 */
export async function tapPastKeyboard(
  selector: Selector,
  opts: TapPastKeyboardOptions = {},
): Promise<void> {
  const name = opts.name ?? selector;

  if (isAndroid()) {
    await hideAndroidKeyboard();
    await (await waitForDisplayed(selector, opts)).click();
    return;
  }

  const deadline = Date.now() + (opts.timeout ?? env.run.waitTimeout);
  let lifts = 0;
  while (Date.now() < deadline) {
    const [element] = await $$(selector).getElements();
    if (element) {
      const keyboardTop = await iosKeyboardTop();
      const bottom = await bottomOf(element);
      const covered =
        keyboardTop !== undefined && bottom !== undefined && bottom > keyboardTop - CLEARANCE;

      if (!covered && (await isShown(element))) {
        await element.click();
        return;
      }
      if (covered && opts.returnKey) {
        log.info(`${name} is under the keyboard — pressing "${opts.returnKey}" (same action)`);
        await pressIosKey(opts.returnKey);
        return;
      }
      if (covered && lifts < 3) {
        lifts += 1;
        log.info(`${name} is under the keyboard (bottom ${bottom}, top ${keyboardTop}) — lifting it`);
        const { width } = await driver.getWindowSize();
        const from = { x: width / 2, y: (keyboardTop as number) - 24 };
        const distance = Math.min((bottom as number) - (keyboardTop as number) + 48, from.y * 0.5);
        await swipe(from, { x: from.x, y: from.y - distance }, 500);
        continue;
      }
    }
    await driver.pause(300);
  }
  throw new Error(`Expected "${name}" to be displayed`);
}
