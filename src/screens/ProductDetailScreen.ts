/**
 * Product detail page (src/screens/ProductDetailScreen.tsx).
 *
 * The variant/quantity form is DSProductOptions mounted with
 * testID="product-detail-actions", so its controls are:
 *   product-detail-actions-submit           Add to Cart / Notify Me button
 *   product-detail-actions-quantity-inc     quantity stepper +
 *   product-detail-actions-option-<g>-<v>   option chips
 * The first in-stock variant is pre-selected, so Add to Cart is enabled
 * without picking an option.
 */
import { $ } from '@wdio/globals';
import { getLabel, waitForDisplayed } from '../core/elements';
import { scrollUntilVisible } from '../core/gestures';
import { by } from '../core/locators';
import { BaseScreen } from './BaseScreen';

/** Button title from i18n `addToCart.addToCart`; out-of-stock swaps it to "Notify me". */
const ADD_TO_CART_LABEL = /add to cart/i;

class ProductDetailScreenObject extends BaseScreen {
  protected readonly screenName = 'Product detail';

  private readonly ids = {
    screen: 'product-detail-screen',
    // Only rendered once the product has loaded (the skeleton has no scroll view).
    content: 'product-detail-scroll-view',
    addToCart: 'product-detail-actions-submit',
    addToList: 'product-detail-actions-wishlist-button',
  };

  protected root() {
    return by.testId(this.ids.screen);
  }

  async waitForProduct(timeout = 60_000): Promise<void> {
    await this.waitForLoaded(timeout);
    await waitForDisplayed(by.testId(this.ids.content), {
      timeout,
      name: 'product details content',
    });
  }

  async addToCart(): Promise<void> {
    const button = await scrollUntilVisible(by.testId(this.ids.addToCart), {
      name: 'Add to Cart button',
      maxSwipes: 6,
    });

    const label = await getLabel(button);
    if (!ADD_TO_CART_LABEL.test(label)) {
      throw new Error(
        `Expected an "Add to Cart" button but found "${label}" — is the product out of stock?`,
      );
    }
    await $(by.testId(this.ids.addToCart)).waitForEnabled({
      timeoutMsg: 'Add to Cart button never became enabled',
    });
    await button.click();
  }

  /** "Add to List" (heart) action under the purchase form; opens the list picker sheet. */
  async openAddToList(): Promise<void> {
    const button = await scrollUntilVisible(by.testId(this.ids.addToList), {
      name: 'Add to List button',
      maxSwipes: 6,
    });
    await button.click();
  }
}

export const ProductDetailScreen = new ProductDetailScreenObject();
