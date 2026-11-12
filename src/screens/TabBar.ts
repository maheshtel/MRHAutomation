/**
 * Bottom tab bar (src/components/composites/navigation/DSTabBar.tsx).
 *
 * The tabs carry no testID — only accessibility labels: "Home tab", "Shop tab",
 * "Account tab", and "Cart tab" / "Cart tab, N item(s)". The cart label is the
 * only place the cart count is exposed, so it doubles as the badge assertion.
 */
import { $, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { appearsWithin, getLabel, tap, waitForDisplayed } from '../core/elements';
import { by } from '../core/locators';

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

export const TabBar = {
  /**
   * Open a tab at its root screen. If the tab resumes on a deeper screen,
   * tapping it again resets its stack (RESET_STACK_ON_RESELECT in the app's
   * tab layout), exactly as a user would.
   */
  async open(tab: TabName): Promise<void> {
    const root = by.testId(ROOT_TEST_ID[tab]);
    await tap(tabSelector(tab), { name: `${tab} tab` });
    if (await appearsWithin(root, 3000)) return;
    await tap(tabSelector(tab), { name: `${tab} tab (reset to root)` });
    await waitForDisplayed(root, { name: `${tab} tab root screen` });
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
