/**
 * Feature: Cleanup
 *
 *   Scenario: Empty the cart and delete the test list
 *     Given I am signed in as a customer
 *     And my cart has at least one product
 *     And a test list exists in My Lists
 *     When I remove every product from my cart
 *     Then my cart is empty and the cart badge shows no items
 *     When I delete the test list
 *     Then the list no longer appears in My Lists
 *
 * After the Wishlist scenario the "Given" steps find the cart item and list it
 * left behind; run on its own, they create them first.
 */
import { addArgument, addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { And, Given, Then, When } from '../../src/core/bdd';
import { AuthFlow } from '../../src/flows/auth.flow';
import { CartFlow } from '../../src/flows/cart.flow';
import { WishlistFlow } from '../../src/flows/wishlist.flow';
import { CartScreen } from '../../src/screens/CartScreen';
import { TabBar } from '../../src/screens/TabBar';
import { WishlistsScreen } from '../../src/screens/WishlistsScreen';
import { catalog, newWishlistName, WISHLIST_PREFIX } from '../data/catalog';
import { users } from '../data/users';

describe('Feature: Cleanup @regression', () => {
  after(async () => {
    await AuthFlow.signOutQuietly();
  });

  it('Scenario: Empty the cart and delete the test list', async () => {
    await addFeature('Cleanup');
    await addSeverity('normal');
    let listName = '';

    await Given('I am signed in as a customer', async () => {
      await AuthFlow.ensureSignedIn(users.customer);
    });

    await And('my cart has at least one product', async () => {
      await CartFlow.ensureHasProduct(catalog.searchTerm);
    });

    await And('a test list exists in My Lists', async () => {
      listName = await WishlistFlow.ensureList(WISHLIST_PREFIX, newWishlistName());
      await addArgument('List name', listName);
    });

    await When('I remove every product from my cart', async () => {
      await TabBar.open('Cart');
      expect(await CartScreen.waitForSettled()).toBe('items');
      await CartScreen.removeAll();
    });

    await Then('my cart is empty and the cart badge shows no items', async () => {
      expect(await CartScreen.isEmpty()).toBe(true);
      expect(await CartScreen.lineItemCount()).toBe(0);
      await TabBar.waitForCartCount(0);
    });

    await When(`I delete the list "${listName}"`, async () => {
      // Deletes every test list, in case an interrupted run left extras.
      const deleted = await WishlistFlow.deleteListsStartingWith(WISHLIST_PREFIX);
      expect(deleted).toContain(listName);
    });

    await Then('the list no longer appears in My Lists', async () => {
      // listsStartingWith re-opens My Lists, so this reads fresh server data.
      expect(await WishlistFlow.listsStartingWith(WISHLIST_PREFIX)).toEqual([]);
      expect(await WishlistsScreen.hasList(listName)).toBe(false);
    });
  });
});
