/**
 * Feature: Quantity and promotions
 *
 *   Scenario: Change an item's quantity and try an invalid coupon
 *     Given my cart is empty
 *     And I have added a searched product to my cart
 *     When I increase the item's quantity
 *     Then the quantity goes up by one and the cart badge matches
 *     When I decrease the item's quantity
 *     Then the quantity goes back down and the cart badge matches
 *     When I apply an invalid coupon code
 *     Then I see a message that the coupon is invalid
 *     And no coupon is applied to my cart
 */
import { addArgument, addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { And, Given, Then, When } from '../../src/core/bdd';
import { CartFlow } from '../../src/flows/cart.flow';
import { CartScreen } from '../../src/screens/CartScreen';
import { TabBar } from '../../src/screens/TabBar';
import { catalog } from '../data/catalog';

describe('Feature: Quantity and promotions @regression', () => {
  after(async () => {
    await CartFlow.emptyCart().catch(() => undefined);
  });

  it("Scenario: Change an item's quantity and try an invalid coupon", async () => {
    await addFeature('Cart');
    await addSeverity('critical');
    let startQuantity = 0;

    await Given('my cart is empty', async () => {
      await CartFlow.emptyCart();
    });

    await And(`I have added a "${catalog.searchTerm}" product to my cart`, async () => {
      const product = await CartFlow.addSearchedProduct(catalog.searchTerm);
      await addArgument('Product', product.title);
      await TabBar.open('Cart');
      expect(await CartScreen.waitForSettled()).toBe('items');
      // Usually 1, but bulk variants can have a higher minimum.
      startQuantity = await CartScreen.firstLineQuantity();
    });

    await When("I increase the item's quantity", async () => {
      await CartScreen.increaseFirstLineQuantity();
    });

    await Then('the quantity goes up by one and the cart badge matches', async () => {
      expect(await CartScreen.firstLineQuantity()).toBe(startQuantity + 1);
      await TabBar.waitForCartCount(startQuantity + 1);
    });

    await When("I decrease the item's quantity", async () => {
      await CartScreen.decreaseFirstLineQuantity();
    });

    await Then('the quantity goes back down and the cart badge matches', async () => {
      expect(await CartScreen.firstLineQuantity()).toBe(startQuantity);
      await TabBar.waitForCartCount(startQuantity);
    });

    await When(`I apply the invalid coupon code "${catalog.invalidCouponCode}"`, async () => {
      await CartScreen.openCouponSection();
      await CartScreen.applyCoupon(catalog.invalidCouponCode);
    });

    await Then('I see a message that the coupon is invalid', async () => {
      const message = await CartScreen.waitForCouponError();
      await addArgument('Coupon message', message);
      expect(message).toMatch(catalog.invalidCouponMessage);
    });

    await And('no coupon is applied to my cart', async () => {
      expect(await CartScreen.appliedCouponCount()).toBe(0);
    });
  });
});
