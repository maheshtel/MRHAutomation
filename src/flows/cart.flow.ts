import type { SearchProduct } from '../screens/SearchOverlay';
import { CartScreen } from '../screens/CartScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { TabBar } from '../screens/TabBar';
import { ProductFlow } from './product.flow';

export const CartFlow = {
  /** Open the Cart tab and remove anything already in it. */
  async emptyCart(): Promise<void> {
    await TabBar.open('Cart');
    if ((await CartScreen.waitForSettled()) === 'items') await CartScreen.removeAll();
    await TabBar.waitForCartCount(0);
  },

  /** Search for a product, add one unit, and wait for the cart badge to count it. */
  async addSearchedProduct(term: string): Promise<SearchProduct> {
    const before = await TabBar.cartCount();
    const product = await ProductFlow.searchAndOpen(term);
    await ProductDetailScreen.addToCart();
    await TabBar.waitForCartCount(before + 1);
    return product;
  },

  /**
   * Make sure the cart has at least one product, adding one if it is empty.
   * Decides from the loaded cart, not the badge: right after sign-in the badge
   * reads 0 until the server cart arrives.
   */
  async ensureHasProduct(term: string): Promise<void> {
    await TabBar.open('Cart');
    if ((await CartScreen.waitForSettled()) === 'items') return;
    await CartFlow.addSearchedProduct(term);
  },
};
