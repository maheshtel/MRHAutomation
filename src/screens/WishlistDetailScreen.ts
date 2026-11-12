/**
 * One list's contents (src/screens/WishlistDetailScreen.tsx).
 *
 *   wishlist-detail-list                 grid of products
 *   wishlist-detail-empty                empty state
 *   wishlist-product-<id>                product card; label starts with the title
 *   wishlist-product-<id>-cart           quick-add "+" (opens the quick-add sheet)
 *   wishlist-quick-add-sheet             DSAddToCartSheet
 *   wishlist-quick-add-sheet-form-submit its Add to Cart button
 *
 * Quick add copies the item into the cart; the item stays on the list.
 */
import { $$ } from '@wdio/globals';
import {
  getLabel,
  getTestId,
  tap,
  waitForAny,
  waitForFirstVisible,
  waitForGone,
} from '../core/elements';
import { by } from '../core/locators';
import { type EdgeOffset, tapNested } from '../core/nested';
import { BaseScreen } from './BaseScreen';

/**
 * iOS fallback for the card's "+" overlay at its top-right corner, in points.
 * Measured on Android with E2E_LOG_LEVEL=debug.
 */
const CARD_QUICK_ADD: EdgeOffset = { fromRight: 22, fromTop: 22 };

const PRODUCT_PATTERN = 'wishlist-product-[0-9]+';

class WishlistDetailScreenObject extends BaseScreen {
  protected readonly screenName = 'List details';

  private readonly ids = {
    list: 'wishlist-detail-list',
    empty: 'wishlist-detail-empty',
    back: 'wishlist-detail-header-back-button',
    quickAddSheet: 'wishlist-quick-add-sheet',
    quickAddSubmit: 'wishlist-quick-add-sheet-form-submit',
  };

  protected root() {
    return by.testId(this.ids.list);
  }

  async waitForSettled(timeout = 60_000): Promise<'items' | 'empty'> {
    return waitForAny(
      { items: by.testIdMatches(PRODUCT_PATTERN), empty: by.testId(this.ids.empty) },
      { timeout, name: 'list products or empty state' },
    );
  }

  async productCount(): Promise<number> {
    return (await $$(by.testIdMatches(PRODUCT_PATTERN)).getElements()).length;
  }

  async productLabels(): Promise<string[]> {
    const labels: string[] = [];
    for (const card of await $$(by.testIdMatches(PRODUCT_PATTERN)).getElements()) {
      labels.push(await getLabel(card));
    }
    return labels;
  }

  /** Quick-add the first product to the cart (default variant, quantity 1). */
  async moveFirstProductToCart(): Promise<void> {
    const card = await waitForFirstVisible(by.testIdMatches(PRODUCT_PATTERN), {
      name: 'list product card',
    });
    await tapNested(card, `${await getTestId(card)}-cart`, CARD_QUICK_ADD, 'quick add button');
    await tap(by.testId(this.ids.quickAddSubmit), { name: 'quick add › Add to Cart' });
    // The sheet closes itself ~1.5s after a successful add.
    await waitForGone(by.testId(this.ids.quickAddSubmit), {
      timeout: 30_000,
      name: 'quick add sheet',
    });
  }

  async goBack(): Promise<void> {
    await tap(by.testId(this.ids.back), { name: 'List details › back' });
  }
}

export const WishlistDetailScreen = new WishlistDetailScreenObject();
