/**
 * Element interactions with explicit, readable waits.
 *
 * WebdriverIO's implicit wait is left at 0: every wait here is explicit, scoped
 * to one element, and fails with a message naming what was expected — which is
 * what makes a CI failure diagnosable from the log alone.
 *
 * WebdriverIO 10 runs with strict selectors: `$()` throws if a selector matches
 * more than one element. That is kept on deliberately — an ambiguous locator is
 * a bug. Helpers that legitimately target "one of many" (pattern selectors such
 * as `home-products-[0-9]+`) go through `$$` via `firstVisible`.
 */
import { $, $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import type { Selector } from './locators';
import { isAndroid } from './platform';

export interface WaitOptions {
  timeout?: number;
  /** Human description used in timeout messages, e.g. "Sign in button". */
  name?: string;
}

const describe = (selector: Selector, name?: string) => name ?? selector;

export async function waitForDisplayed(selector: Selector, opts: WaitOptions = {}) {
  const element = $(selector);
  await element.waitForDisplayed({
    timeout: opts.timeout ?? env.run.waitTimeout,
    timeoutMsg: `Expected "${describe(selector, opts.name)}" to be displayed`,
  });
  return element;
}

/**
 * Wait until nothing matching the selector is visible.
 *
 * Re-queries on every poll instead of polling one element reference: once a
 * sheet or dialog closes, UiAutomator2 can keep answering "displayed" for the
 * cached reference to its detached view, so a reference-based wait times out
 * even though the screen has already changed.
 */
export async function waitForGone(selector: Selector, opts: WaitOptions = {}): Promise<void> {
  await driver.waitUntil(async () => !(await isVisible(selector)), {
    timeout: opts.timeout ?? env.run.waitTimeout,
    interval: 400,
    timeoutMsg: `Expected "${describe(selector, opts.name)}" to disappear`,
  });
}

/** First visible element matching the selector (any number may match), or undefined. */
export async function firstVisible(selector: Selector): Promise<WebdriverIO.Element | undefined> {
  const elements = await $$(selector).getElements();
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return undefined;
}

/** Non-throwing check that at least one matching element is visible. No waiting. */
export async function isVisible(selector: Selector): Promise<boolean> {
  return (await firstVisible(selector)) !== undefined;
}

/** Polls until a match is visible; returns false (never throws) after `timeout`. */
export async function appearsWithin(selector: Selector, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  do {
    if (await isVisible(selector)) return true;
    await driver.pause(300);
  } while (Date.now() < deadline);
  return false;
}

/** Wait for the first visible match of a selector that may match several elements. */
export async function waitForFirstVisible(selector: Selector, opts: WaitOptions = {}) {
  let found: WebdriverIO.Element | undefined;
  await driver.waitUntil(async () => (found = await firstVisible(selector)) !== undefined, {
    timeout: opts.timeout ?? env.run.waitTimeout,
    interval: 400,
    timeoutMsg: `Expected "${describe(selector, opts.name)}" to be displayed`,
  });
  return found as WebdriverIO.Element;
}

/**
 * Waits until one of several selectors is visible and returns the key of the
 * first match — for screens that settle into one of several states (e.g. a
 * cart that is either empty or has items).
 */
export async function waitForAny<K extends string>(
  candidates: Record<K, Selector>,
  opts: WaitOptions = {},
): Promise<K> {
  let found: K | undefined;
  await driver.waitUntil(
    async () => {
      for (const [key, selector] of Object.entries(candidates) as [K, Selector][]) {
        if (await isVisible(selector)) {
          found = key;
          return true;
        }
      }
      return false;
    },
    {
      timeout: opts.timeout ?? env.run.waitTimeout,
      interval: 400,
      timeoutMsg: `Expected one of [${Object.keys(candidates).join(', ')}] to be displayed${
        opts.name ? ` (${opts.name})` : ''
      }`,
    },
  );
  return found as K;
}

export async function tap(selector: Selector, opts: WaitOptions = {}): Promise<void> {
  const element = await waitForDisplayed(selector, opts);
  await element.click();
}

export async function typeText(selector: Selector, text: string, opts: WaitOptions = {}) {
  const element = await waitForDisplayed(selector, opts);
  await element.click();
  await element.clearValue();
  await element.setValue(text);
}

/** Number of currently visible elements matching the selector. */
export async function countVisible(selector: Selector): Promise<number> {
  const elements = await $$(selector).getElements();
  // Sequential on purpose: Appium serialises commands per session anyway.
  let visible = 0;
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) visible += 1;
  }
  return visible;
}

/** The accessibility label (Android `content-desc`, iOS `label`). */
export async function getLabel(element: WebdriverIO.Element): Promise<string> {
  const value = await element.getAttribute(isAndroid() ? 'content-desc' : 'label');
  return value ?? '';
}

/** The React Native testID (Android `resource-id`, iOS `name`). */
export async function getTestId(element: WebdriverIO.Element): Promise<string> {
  const value = await element.getAttribute(isAndroid() ? 'resource-id' : 'name');
  return value ?? '';
}

export async function hideKeyboard(): Promise<void> {
  try {
    if (!(await driver.isKeyboardShown())) return;
    if (isAndroid()) {
      await driver.hideKeyboard();
    } else {
      // iOS has no universal "hide" — pressing the return key works for the
      // single-line fields this app uses.
      await driver.execute('mobile: hideKeyboard', { keys: ['return', 'done', 'Done'] });
    }
  } catch {
    // Keyboard already gone, or the platform refused; neither should fail a test.
  }
}
