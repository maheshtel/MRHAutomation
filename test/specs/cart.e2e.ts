/**
 * Feature: Cart management
 *
 *   Scenario: Add a searched product to the cart and remove it
 *     Given my cart is empty
 *     When I search for a product and open the first in-stock result
 *     And I add it to my cart
 *     Then the cart badge shows 1 item
 *     And my cart lists that product
 *     When I remove the product from my cart
 *     Then my cart is empty
 *     And the cart badge shows no items
 */
import { addArgument, addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { And, Given, Then, When } from '../../src/core/bdd';
import { CartFlow } from '../../src/flows/cart.flow';
import { ProductFlow } from '../../src/flows/product.flow';
import { CartScreen } from '../../src/screens/CartScreen';
import { ProductDetailScreen } from '../../src/screens/ProductDetailScreen';
import type { SearchProduct } from '../../src/screens/SearchOverlay';
import { TabBar } from '../../src/screens/TabBar';
import { catalog } from '../data/catalog';
import { sameProduct } from '../data/matchers';

describe('Feature: Cart management @smoke', () => {
  after(async () => {
    await CartFlow.emptyCart().catch(() => undefined);
  });

  it('Scenario: Add a searched product to the cart and remove it', async () => {
    await addFeature('Cart');
    await addSeverity('critical');
    let product: SearchProduct;

    await Given('my cart is empty', async () => {
      await CartFlow.emptyCart();
    });

    await When(
      `I search for "${catalog.searchTerm}" and open the first in-stock result`,
      async () => {
        product = await ProductFlow.searchAndOpen(catalog.searchTerm);
        await addArgument('Product', product.title);
      },
    );

    await And('I add it to my cart', async () => {
      await ProductDetailScreen.addToCart();
    });

    await Then('the cart badge shows 1 item', async () => {
      await TabBar.waitForCartCount(1);
    });

    await And('my cart lists that product', async () => {
      await TabBar.open('Cart');
      expect(await CartScreen.waitForSettled()).toBe('items');
      const lines = await CartScreen.lineItemLabels();
      expect(lines).toHaveLength(1);
      expect(sameProduct(lines[0], product.title)).toBe(true);
    });

    await When('I remove the product from my cart', async () => {
      await CartScreen.removeFirstLine();
    });

    await Then('my cart is empty', async () => {
      await CartScreen.waitForEmpty();
      expect(await CartScreen.lineItemCount()).toBe(0);
    });

    await And('the cart badge shows no items', async () => {
      await TabBar.waitForCartCount(0);
    });
  });
});
