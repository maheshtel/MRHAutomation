/**
 * Feature: Wishlist management
 *
 *   Scenario: Create a list, save a product to it, and move it to the cart
 *     Given I am signed in as a customer
 *     And my cart is empty
 *     And no test lists are left over from earlier runs
 *     When I create a new list
 *     Then the list appears in My Lists with no items
 *     When I search for a product and save it to my new list
 *     Then the list shows 1 item
 *     When I open the list
 *     Then it contains that product
 *     When I move the product to my cart
 *     Then the cart badge shows 1 item
 *     And my cart contains that product
 *
 * The cart item and the list are left in place on purpose: the Cleanup
 * scenario removes them (and recreates them first when run on its own).
 */
import { addArgument, addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { And, Given, Then, When } from '../../src/core/bdd';
import { AuthFlow } from '../../src/flows/auth.flow';
import { CartFlow } from '../../src/flows/cart.flow';
import { ProductFlow } from '../../src/flows/product.flow';
import { WishlistFlow } from '../../src/flows/wishlist.flow';
import { AddToListSheet } from '../../src/screens/AddToListSheet';
import { CartScreen } from '../../src/screens/CartScreen';
import { ProductDetailScreen } from '../../src/screens/ProductDetailScreen';
import type { SearchProduct } from '../../src/screens/SearchOverlay';
import { TabBar } from '../../src/screens/TabBar';
import { WishlistDetailScreen } from '../../src/screens/WishlistDetailScreen';
import { WishlistsScreen } from '../../src/screens/WishlistsScreen';
import { catalog, newWishlistName, WISHLIST_PREFIX } from '../data/catalog';
import { sameProduct } from '../data/matchers';
import { users } from '../data/users';

describe('Feature: Wishlist management @regression', () => {
  it('Scenario: Create a list, save a product to it, and move it to the cart', async () => {
    await addFeature('Wishlist');
    await addSeverity('critical');
    const listName = newWishlistName();
    await addArgument('List name', listName);
    let product: SearchProduct;

    await Given('I am signed in as a customer', async () => {
      await AuthFlow.ensureSignedIn(users.customer);
    });

    await And('my cart is empty', async () => {
      await CartFlow.emptyCart();
    });

    await And('no test lists are left over from earlier runs', async () => {
      await WishlistFlow.deleteListsStartingWith(WISHLIST_PREFIX);
    });

    await When(`I create a new list named "${listName}"`, async () => {
      await WishlistsScreen.createList(listName);
    });

    await Then('the list appears in My Lists with no items', async () => {
      expect(await WishlistsScreen.hasList(listName)).toBe(true);
      expect(await WishlistsScreen.itemCount(listName)).toBe(0);
    });

    await When(
      `I search for "${catalog.searchTerm}" and save the first result to my new list`,
      async () => {
        product = await ProductFlow.searchAndOpen(catalog.searchTerm);
        await addArgument('Product', product.title);
        await ProductDetailScreen.openAddToList();
        await AddToListSheet.addToList(listName);
      },
    );

    await Then('the list shows 1 item', async () => {
      await WishlistFlow.openMyLists();
      await WishlistsScreen.waitForItemCount(listName, 1);
    });

    await When('I open the list', async () => {
      await WishlistsScreen.openList(listName);
    });

    await Then('it contains that product', async () => {
      expect(await WishlistDetailScreen.waitForSettled()).toBe('items');
      const cards = await WishlistDetailScreen.productLabels();
      expect(cards).toHaveLength(1);
      expect(sameProduct(cards[0], product.title)).toBe(true);
    });

    await When('I move the product to my cart', async () => {
      await WishlistDetailScreen.moveFirstProductToCart();
    });

    await Then('the cart badge shows 1 item', async () => {
      await TabBar.waitForCartCount(1);
    });

    await And('my cart contains that product', async () => {
      await TabBar.open('Cart');
      expect(await CartScreen.waitForSettled()).toBe('items');
      const lines = await CartScreen.lineItemLabels();
      expect(lines).toHaveLength(1);
      expect(sameProduct(lines[0], product.title)).toBe(true);
    });
  });
});
