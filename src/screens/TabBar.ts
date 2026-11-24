/**
 * Bottom tab bar (src/components/composites/navigation/DSTabBar.tsx).
 *
 * The tabs carry no testID — only accessibility labels: "Home tab", "Shop tab",
 * "Account tab", and "Cart tab" / "Cart tab, N item(s)". The cart label is the
 * only place the cart count is exposed, so it doubles as the badge assertion.
 */
import { $, $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { appearsWithin, getLabel, isVisible, tap, waitForDisplayed } from '../core/elements';
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
  if (isAndroid()) return waitUntilSettledAndroid(selector, name);
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

/**
 * Android: same "x ≥ 0 and unchanged between two reads", but the element is
 * found ONCE and only its frame is re-read (re-found only if it went stale),
 * within the run's wait timeout. A find costs 6–27 s on the 1-vCPU CI
 * emulator against ~0.2 s for a frame read: on 2026-11-24 the Home root sat
 * still at [0,0][1080,2400], yet the iOS loop above (a find per read, 10 s)
 * timed out during its second find ("kept moving … last frame" empty).
 */
async function waitUntilSettledAndroid(selector: Selector, name: string): Promise<void> {
  let elementId: string | undefined;
  let last = '';
  const timeout = env.run.waitTimeout;
  await driver.waitUntil(
    async () => {
      elementId ??= (await $$(selector).getElements())[0]?.elementId;
      const rect = elementId
        ? await driver.getElementRect(elementId).catch(() => undefined)
        : undefined;
      if (!rect) elementId = undefined; // stale or not found: find it again next time
      const now = rect ? `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}` : '';
      const settled = rect !== undefined && rect.x >= 0 && now === last;
      last = now;
      return settled;
    },
    {
      timeout,
      interval: 250,
      timeoutMsg: `${name} kept moving for ${Math.round(timeout / 1000)}s (last frame ${last || 'not found'})`,
    },
  );
}

/**
 * Is the tab's root on screen right after the tap? On Android one lookup can
 * outlast the 3 s window: on CI (2026-11-24) the first find after tapping Home
 * took 10.8 s and came back empty while Home was still mounting, so the reset
 * tap (22.6 s) and its settle wait ran for nothing. Android gets one more look
 * after the window; on a fast device that costs one lookup (~0.3 s).
 */
async function rootAppearsAfterTap(root: Selector): Promise<boolean> {
  if (await appearsWithin(root, 3000)) return true;
  return isAndroid() ? isVisible(root) : false;
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
    if (await rootAppearsAfterTap(root)) return;
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
