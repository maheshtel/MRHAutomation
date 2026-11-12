/**
 * Cart tab root (src/screens/CartScreen.tsx + components/cart/DSCartItem.tsx).
 *
 *   cart-screen                     screen root
 *   cart-list                       FlatList of line items
 *   cart-empty                      empty state (rendered inside cart-list)
 *   cart-item-<entityId>            physical line; label "…title, quantity N, price …, total …"
 *   cart-item-<id>-delete           trash button (no confirmation; last line clears the cart)
 *   cart-item-<id>-stepper-inc|dec  quantity stepper (each tap is one API update)
 *   cart-gift-certificate-<id>      gift certificate line
 *   cart-coupon                     collapsible coupon card (list footer)
 *     cart-coupon-toggle            expand / collapse
 *     cart-coupon-input-input       code field
 *     cart-coupon-input-apply       Apply button
 *     cart-coupon-input-error       inline error
 *     cart-coupon-code-<CODE>       applied coupon row
 *
 * Line-item entity ids are BigCommerce UUIDs (hex + dashes). Every child testID
 * appends a word containing a non-hex letter (-product, -delete, -stepper…), so
 * `[0-9a-fA-F-]+` matches the rows and nothing inside them.
 *
 * DSCartItem's root is `accessible`, so iOS hides the delete button and the
 * stepper inside it; see src/core/nested.ts for how those are reached.
 */
import { $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import {
  getLabel,
  getTestId,
  hideKeyboard,
  isVisible,
  tap,
  typeText,
  waitForAny,
  waitForDisplayed,
} from '../core/elements';
import { scrollUntilVisible } from '../core/gestures';
import { by } from '../core/locators';
import { type EdgeOffset, tapNested } from '../core/nested';
import { BaseScreen } from './BaseScreen';

const LINE_ITEM_PATTERN = 'cart-(item|gift-certificate)-[0-9a-fA-F-]+';

/**
 * iOS fallback positions inside a cart row, in points from the row's edges.
 * Measured on Android (Pixel 9a, 2026-11-10) with E2E_LOG_LEVEL=debug — see
 * src/core/nested.ts. The stepper sits in the footer after the Price column;
 * the trash button hangs level with the last attribute line, so its `fromTop`
 * shifts if a product shows more attribute lines than the test product.
 */
const ROW_CONTROLS: Record<'delete' | 'increase' | 'decrease', EdgeOffset> = {
  delete: { fromRight: 16, fromTop: 92 },
  decrease: { fromLeft: 151, fromBottom: 33 },
  increase: { fromLeft: 223, fromBottom: 33 },
};

/** The floating order summary covers the lower part of the cart. */
const CART_SAFE_BOTTOM = 0.55;

/** "…, quantity 3, price …" → 3 */
const parseQuantity = (label: string): number | undefined => {
  const match = label.match(/quantity\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
};

class CartScreenObject extends BaseScreen {
  protected readonly screenName = 'Cart';

  private readonly ids = {
    empty: 'cart-empty',
    couponToggle: 'cart-coupon-toggle',
    couponInput: 'cart-coupon-input-input',
    couponApply: 'cart-coupon-input-apply',
    couponError: 'cart-coupon-input-error',
  };

  protected root() {
    return by.testId('cart-screen');
  }

  private emptyState() {
    return by.testId(this.ids.empty);
  }

  private lineItems() {
    return by.testIdMatches(LINE_ITEM_PATTERN);
  }

  // ── State ──────────────────────────────────────────────────────────────────

  /** Wait until the skeleton is replaced by either line items or the empty state. */
  async waitForSettled(timeout = 60_000): Promise<'empty' | 'items'> {
    await this.waitForLoaded(timeout);
    return waitForAny(
      { empty: this.emptyState(), items: this.lineItems() },
      { timeout, name: 'cart contents or empty state' },
    );
  }

  async isEmpty(): Promise<boolean> {
    return isVisible(this.emptyState());
  }

  async waitForEmpty(timeout = env.run.waitTimeout): Promise<void> {
    await waitForDisplayed(this.emptyState(), { timeout, name: 'empty cart state' });
  }

  async lineItemCount(): Promise<number> {
    return (await $$(this.lineItems()).getElements()).length;
  }

  /** Accessibility labels of all line items (title, quantity, price, total). */
  async lineItemLabels(): Promise<string[]> {
    const labels: string[] = [];
    for (const row of await $$(this.lineItems()).getElements()) labels.push(await getLabel(row));
    return labels;
  }

  private async firstLine(): Promise<WebdriverIO.Element> {
    const rows = await $$(this.lineItems()).getElements();
    if (rows.length === 0) throw new Error('The cart has no line items');
    return rows[0];
  }

  // ── Quantity ───────────────────────────────────────────────────────────────

  async firstLineQuantity(): Promise<number> {
    const label = await getLabel(await this.firstLine());
    const quantity = parseQuantity(label);
    if (quantity === undefined) throw new Error(`No quantity in cart row label "${label}"`);
    return quantity;
  }

  async increaseFirstLineQuantity(): Promise<void> {
    await this.stepFirstLine('increase', 'inc');
  }

  async decreaseFirstLineQuantity(): Promise<void> {
    await this.stepFirstLine('decrease', 'dec');
  }

  /** Each tap triggers one cart update; wait for it before returning. */
  private async stepFirstLine(control: 'increase' | 'decrease', suffix: 'inc' | 'dec') {
    const before = await this.firstLineQuantity();
    const expected = control === 'increase' ? before + 1 : before - 1;
    const row = await this.firstLine();
    await tapNested(
      row,
      `${await getTestId(row)}-stepper-${suffix}`,
      ROW_CONTROLS[control],
      `quantity ${control} button`,
    );
    await this.waitForFirstLineQuantity(expected);
  }

  async waitForFirstLineQuantity(expected: number, timeout = env.run.waitTimeout) {
    let last: number | undefined;
    await driver.waitUntil(
      async () => {
        last = await this.firstLineQuantity().catch(() => undefined);
        return last === expected;
      },
      {
        timeout,
        interval: 500,
        timeoutMsg: `Expected the cart line quantity to be ${expected}, last saw ${last}`,
      },
    );
  }

  // ── Removal ────────────────────────────────────────────────────────────────

  /** Remove the first line item and wait for the list to reflect it. */
  async removeFirstLine(): Promise<void> {
    const row = await this.firstLine();
    const before = await this.lineItemCount();
    await tapNested(row, `${await getTestId(row)}-delete`, ROW_CONTROLS.delete, 'delete button');

    await driver.waitUntil(
      async () => (await this.isEmpty()) || (await this.lineItemCount()) < before,
      {
        timeout: env.run.waitTimeout,
        interval: 500,
        timeoutMsg: `Cart still shows ${before} line item(s) after tapping delete`,
      },
    );
  }

  /** Remove every line until the empty state shows. Safe to call on an empty cart. */
  async removeAll(maxLines = 20): Promise<void> {
    for (let i = 0; i < maxLines; i += 1) {
      if (await this.isEmpty()) return;
      if ((await this.lineItemCount()) === 0) break;
      await this.removeFirstLine();
    }
    await this.waitForEmpty();
  }

  // ── Coupons ────────────────────────────────────────────────────────────────

  /** Scroll to the coupon card and expand it (it starts collapsed with no coupon). */
  async openCouponSection(): Promise<void> {
    await scrollUntilVisible(by.testId(this.ids.couponToggle), {
      name: 'coupon section',
      maxSwipes: 6,
      safeBottom: CART_SAFE_BOTTOM,
    });
    if (!(await isVisible(by.testId(this.ids.couponInput)))) {
      await tap(by.testId(this.ids.couponToggle), { name: 'coupon section toggle' });
    }
    await scrollUntilVisible(by.testId(this.ids.couponInput), {
      name: 'coupon code field',
      maxSwipes: 3,
      safeBottom: CART_SAFE_BOTTOM,
    });
  }

  async applyCoupon(code: string): Promise<void> {
    await typeText(by.testId(this.ids.couponInput), code, { name: 'coupon code field' });
    await hideKeyboard();
    await tap(by.testId(this.ids.couponApply), { name: 'Apply coupon button' });
  }

  /** Waits for the inline coupon error and returns its text. */
  async waitForCouponError(timeout = env.run.waitTimeout): Promise<string> {
    const error = await waitForDisplayed(by.testId(this.ids.couponError), {
      timeout,
      name: 'coupon error message',
    });
    return error.getText();
  }

  /** Codes currently applied to the cart (rows `cart-coupon-code-<CODE>`). */
  async appliedCouponCount(): Promise<number> {
    return (await $$(by.testIdStartsWith('cart-coupon-code-')).getElements()).length;
  }
}

export const CartScreen = new CartScreenObject();
