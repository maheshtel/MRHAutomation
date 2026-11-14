/**
 * Getting past the on-screen keyboard WITHOUT pressing its return key.
 *
 * In this app every single-line field's return key runs `onSubmitEditing`:
 *   - password      → handleLogin   (same as "SIGN IN")
 *   - coupon code   → apply()       (same as "Apply")
 *   - wishlist name → handleSubmit  (same as "Create")
 *   - search        → commit()      (leaves the typeahead for the results page)
 *
 * XCUITest has no key-free "hide keyboard" on iPhone: `driver.hideKeyboard()` /
 * `mobile: hideKeyboard` always tap Done/return. So "hide the keyboard, then tap
 * the button" submits the form via the keyboard and then waits for a button
 * that has already gone (the iOS login failure), or double-submits.
 *
 * Instead the button is tapped with the keyboard still open. Every scroll
 * container in the app sets `keyboardShouldPersistTaps="handled"`, so that one
 * tap both dismisses the keyboard and presses the button — exactly what a
 * user does.
 */
import { $$, driver } from '@wdio/globals';
import { waitForDisplayed, type WaitOptions } from './elements';
import { swipe } from './gestures';
import { createLogger } from './logger';
import type { Selector } from './locators';
import { isAndroid } from './platform';

const log = createLogger('keyboard');

/** Pixels kept between the target's bottom edge and the keyboard. */
const CLEARANCE = 4;

export interface TapPastKeyboardOptions extends WaitOptions {
  /**
   * The focused field's return key performs the very same action as this
   * button. If the button cannot be uncovered, pressing return is then an
   * equivalent last resort instead of a failure.
   */
  returnKeyIsEquivalent?: boolean;
}

/** Android: BACK closes the keyboard and never submits anything. */
export async function hideAndroidKeyboard(): Promise<void> {
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

async function bottomOf(element: WebdriverIO.Element): Promise<number> {
  const { y, height } = await driver.getElementRect(element.elementId);
  return y + height;
}

/**
 * Tap a control that follows text entry (Sign in, Apply, Create, a search
 * result) without the keyboard's return key ever being pressed.
 *
 * Android: hide the keyboard with BACK, then tap.
 * iOS: tap straight through the open keyboard. If the control sits under the
 * keyboard, drag the content above the keyboard upwards to lift it into view
 * (a drag presses no key), then tap.
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

  let element = await waitForDisplayed(selector, opts);
  for (let lift = 0; lift < 3; lift++) {
    const keyboardTop = await iosKeyboardTop();
    const bottom = await bottomOf(element);
    if (keyboardTop === undefined || bottom <= keyboardTop - CLEARANCE) {
      await element.click();
      return;
    }
    log.info(`${name} is under the keyboard (bottom ${bottom}, keyboard top ${keyboardTop}) — lifting it`);
    const { width } = await driver.getWindowSize();
    const from = { x: width / 2, y: keyboardTop - 24 };
    const distance = Math.min(bottom - keyboardTop + 48, from.y * 0.5);
    await swipe(from, { x: from.x, y: from.y - distance }, 500);
    element = await waitForDisplayed(selector, opts);
  }

  if (opts.returnKeyIsEquivalent) {
    log.warn(`${name} stayed under the keyboard — submitting with the return key (same action)`);
    await driver.execute('mobile: hideKeyboard', { keys: ['done', 'Done', 'return', 'Return', 'go', 'Go'] });
    return;
  }
  throw new Error(`${name} is covered by the keyboard and could not be scrolled into view`);
}
