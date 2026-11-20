/**
 * Bottom tab bar (src/components/composites/navigation/DSTabBar.tsx).
 *
 * The tabs carry no testID — only accessibility labels: "Home tab", "Shop tab",
 * "Account tab", and "Cart tab" / "Cart tab, N item(s)". The cart label is the
 * only place the cart count is exposed, so it doubles as the badge assertion.
 */
import { $, $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { appearsWithin, getLabel, tap, waitForDisplayed } from '../core/elements';
import { iosKeyboardTop } from '../core/keyboard';
import { by, type Selector } from '../core/locators';
import { isAndroid } from '../core/platform';

export type TabName = 'Home' | 'Shop' | 'Cart' | 'Account';

const tabSelector = (tab: TabName) =>
  tab === 'Cart' ? by.labelStartsWith('Cart tab') : by.label(`${tab} tab`);

/** "Cart tab, 2 items" → 2; "Cart tab" → 0. */
const parseCartCount = (label: string): number => {
  const match = label.match(/Cart tab,\s*(\d+)\s+item/i);
  return match ? Number(match[1]) : 0;
};

/**
 * The element that proves a tab is showing its ROOT screen. Switching tabs
 * resumes wherever that tab's stack was left (e.g. Account › My Lists), so
 * "open the tab" is only finished once its root is on screen.
 */
const ROOT_TEST_ID: Record<TabName, string> = {
  Home: 'home-screen',
  Shop: 'shop-screen-header',
  Cart: 'cart-screen',
  Account: 'account-screen',
};

/**
 * On iOS an open keyboard covers the floating tab bar, which then reads as
 * "not displayed". Name that cause instead of the symptom. Only runs after a
 * failure, so a passing tap pays nothing for it.
 */
async function explainHiddenTabBar(error: unknown): Promise<unknown> {
  if (isAndroid() || (await iosKeyboardTop().catch(() => undefined)) === undefined) return error;
  return new Error(
    `${(error as Error).message} — the on-screen keyboard is open and covers the tab bar ` +
      '(an earlier step left a text field focused)',
    { cause: error },
  );
}

/**
 * The reset tap POPS the tab's stack: the root slides back in from the left.
 * Its full-screen container counts as displayed as soon as it is on screen,
 * while the rows inside are not visible yet. Searching for a row mid-slide
 * once made a scroll helper swipe Account › My Lists off the top. "Open" is
 * finished when the root's frame is at rest: x ≥ 0 and unchanged between two
 * reads. Re-queried each read (protocol command), so a re-render is harmless.
 */
async function waitUntilSettled(selector: Selector, name: string): Promise<void> {
  let last = '';
  await driver.waitUntil(
    async () => {
      const [element] = await $$(selector).getElements();
      const rect = element?.elementId
        ? await driver.getElementRect(element.elementId).catch(() => undefined)
        : undefined;
      const now = rect ? `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}` : '';
      const settled = rect !== undefined && rect.x >= 0 && now === last;
      last = now;
      return settled;
    },
    { timeout: 10_000, interval: 250, timeoutMsg: `${name} kept moving for 10s (last frame ${last})` },
  );
}

export const TabBar = {
  /**
   * Open a tab at its root screen. If the tab resumes on a deeper screen,
   * tapping it again resets its stack (RESET_STACK_ON_RESELECT in the app's
   * tab layout), exactly as a user would.
   */
  async open(tab: TabName): Promise<void> {
    const root = by.testId(ROOT_TEST_ID[tab]);
    try {
      await tap(tabSelector(tab), { name: `${tab} tab` });
    } catch (error) {
      throw await explainHiddenTabBar(error);
    }
    if (await appearsWithin(root, 3000)) return;
    await tap(tabSelector(tab), { name: `${tab} tab (reset to root)` });
    await waitForDisplayed(root, { name: `${tab} tab root screen` });
    await waitUntilSettled(root, `${tab} tab root screen`);
  },

  async cartCount(): Promise<number> {
    const element = await $(tabSelector('Cart')).getElement();
    return parseCartCount(await getLabel(element));
  },

  async waitForCartCount(expected: number, timeout = env.run.waitTimeout): Promise<void> {
    let last = -1;
    await driver.waitUntil(
      async () => {
        last = await TabBar.cartCount().catch(() => -1);
        return last === expected;
      },
      {
        timeout,
        interval: 500,
        timeoutMsg: `Expected the cart tab to report ${expected} item(s), last saw ${last}`,
      },
    );
  },
};
