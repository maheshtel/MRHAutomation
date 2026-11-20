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
import { $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { createLogger } from './logger';
import type { Selector } from './locators';
import { isAndroid } from './platform';

export interface WaitOptions {
  timeout?: number;
  /** Human description used in timeout messages, e.g. "Sign in button". */
  name?: string;
}

const log = createLogger('elements');

const describe = (selector: Selector, name?: string) => name ?? selector;

let windowSize: { sessionId: string; width: number; height: number } | undefined;

/**
 * iOS: selectors whose matches are not accessibility elements (see `isShown`).
 * Whether a React Native view is an accessibility element is fixed by its
 * component, so this holds for the whole run.
 */
const nonAccessibleSelectors = new Set<Selector>();

/** Window size, read once per session (each read costs seconds on a busy CI Mac). */
export async function screenSize(): Promise<{ width: number; height: number }> {
  if (windowSize?.sessionId !== driver.sessionId) {
    const { width, height } = await driver.getWindowSize();
    windowSize = { sessionId: driver.sessionId, width, height };
  }
  return windowSize;
}

/**
 * Is this element on screen?
 *
 * Android: UiAutomator2's `displayed` is reliable.
 *
 * iOS: XCUITest computes `visible` only for accessibility elements. Views that
 * are NOT accessibility elements (`accessible="false"`) are reported
 * `visible="false"` even while they fill the screen — a screen root
 * (`login-screen`, `home-screen`), an image (`home-top-banner-1`), a text
 * inside a card. Measured over the CI page sources: every on-screen node with
 * visible="false" had accessible="false", and every accessible="true" node with
 * visible="false" really was off screen. So for non-accessible nodes only,
 * "on screen" means: a non-empty frame that overlaps the window. React
 * Navigation removes screens that are not showing from the iOS hierarchy, and
 * scrolled-away content has an off-window frame, so this stays meaningful.
 *
 * Pass the selector the element was found with: once a selector is known to
 * match non-accessible nodes, later checks go straight to the frame. That
 * skips `displayed` (always false for them, and the costliest query: up to
 * 10 s on Home on a CI Mac) and the `accessible` read: 3 calls become 1.
 *
 * Every read goes through the plain protocol command for the element's id,
 * never the element's own method (`element.isDisplayed()`): when an element
 * method hits a stale element, WebdriverIO 10 re-finds it by its selector and
 * WAITS up to `waitforTimeout` (30 s) for it to come back. For an element that
 * just closed (a sheet's button) it never comes back, so a single check blocked
 * for 30 s — longer than the wait it was part of ("quick add sheet to
 * disappear" failed on iOS CI with the sheet already gone) — and kept polling
 * in the background into the next test. Here a stale element is simply
 * "not shown": every poll re-queries anyway.
 */
export async function isShown(element: WebdriverIO.Element, selector?: Selector): Promise<boolean> {
  const id = element.elementId;
  if (!id) return false;
  const displayed = () => driver.isElementDisplayed(id).catch(() => false);
  if (isAndroid()) return displayed();
  const knownNonAccessible = selector !== undefined && nonAccessibleSelectors.has(selector);
  if (!knownNonAccessible && (await displayed())) return true;
  try {
    if (!knownNonAccessible) {
      if ((await driver.getElementAttribute(id, 'accessible')) !== 'false') return false;
      if (selector !== undefined) nonAccessibleSelectors.add(selector);
    }
    const rect = await driver.getElementRect(element.elementId);
    const screen = await screenSize();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x < screen.width &&
      rect.y < screen.height &&
      rect.x + rect.width > 0 &&
      rect.y + rect.height > 0
    );
  } catch {
    return false; // stale / gone between the find and the check
  }
}

/**
 * Wait until the element is on screen (see `isShown`) and return it.
 * Re-queries on every poll, so a re-rendered element never leaves the wait
 * holding a stale reference.
 */
export async function waitForDisplayed(selector: Selector, opts: WaitOptions = {}) {
  let found: WebdriverIO.Element | undefined;
  await driver.waitUntil(
    async () => {
      const elements = await $$(selector).getElements();
      if (elements.length > 1) {
        throw new Error(
          `Selector "${describe(selector, opts.name)}" matches ${elements.length} elements; ` +
            'use waitForFirstVisible for one-of-many locators',
        );
      }
      // Destructure, never index: reading `elements[0]` of an EMPTY WebdriverIO
      // 10 element list silently waits up to `waitforTimeout` for a match.
      const [first] = elements;
      found = first && (await isShown(first, selector)) ? first : undefined;
      return found !== undefined;
    },
    {
      timeout: opts.timeout ?? env.run.waitTimeout,
      interval: 300,
      timeoutMsg: `Expected "${describe(selector, opts.name)}" to be displayed`,
    },
  );
  return found as WebdriverIO.Element;
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
    if (await isShown(element, selector)) return element;
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

export interface TypeOptions extends WaitOptions {
  /** Keep the typed value out of logs and reports (passwords). */
  mask?: boolean;
}

/**
 * Type into a field and make sure the field really holds the text.
 *
 * The app's inputs are controlled React Native fields: every keystroke goes to
 * JS state and back. When the JS thread lags (an overloaded CI Mac), the value
 * coming back can overwrite keystrokes the driver already typed. On iOS CI the
 * search field kept only "l" of "lavender", the driver reported success, and
 * the test then waited 20 s for results that could never match. So the field is
 * read back; dropped keystrokes are logged as a warning and the text is typed
 * once more. Masked (password) fields read back as bullets and are not checked.
 */
export async function typeText(selector: Selector, text: string, opts: TypeOptions = {}) {
  const name = describe(selector, opts.name);
  const element = await waitForDisplayed(selector, opts);
  await element.click();
  let shown = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await element.clearValue();
    await element.setValue(text, opts.mask ? { mask: true } : undefined);
    if (opts.mask) return;
    shown = await settledFieldText(element, text);
    if (sameText(shown, text)) return;
    if (attempt === 1) {
      log.warn(`"${name}" holds "${shown}" after typing "${text}" (keystrokes dropped); typing it again`);
    }
  }
  throw new Error(`Typed "${text}" into "${name}" but the field holds "${shown}"`);
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The field's text once it matches `expected`, or what it holds after 3 s. */
async function settledFieldText(element: WebdriverIO.Element, expected: string): Promise<string> {
  const attribute = isAndroid() ? 'text' : 'value';
  const deadline = Date.now() + 3000;
  let value = '';
  do {
    value = (await driver.getElementAttribute(element.elementId, attribute).catch(() => null)) ?? '';
    if (sameText(value, expected)) return value;
    await driver.pause(300);
  } while (Date.now() < deadline);
  return value;
}

/** Number of currently visible elements matching the selector. */
export async function countVisible(selector: Selector): Promise<number> {
  const elements = await $$(selector).getElements();
  // Sequential on purpose: Appium serialises commands per session anyway.
  let visible = 0;
  for (const element of elements) {
    if (await isShown(element, selector)) visible += 1;
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
