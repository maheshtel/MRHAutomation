import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { SearchOverlay, type SearchProduct } from '../screens/SearchOverlay';
import { ShopScreen } from '../screens/ShopScreen';
import { TabBar } from '../screens/TabBar';

export const ProductFlow = {
  /** Shop › search › open the first in-stock result. Leaves the product page open. */
  async searchAndOpen(term: string): Promise<SearchProduct> {
    await TabBar.open('Shop');
    await ShopScreen.waitForContent();
    await ShopScreen.openSearch();
    await SearchOverlay.search(term);
    const product = await SearchOverlay.openFirstInStockProduct(term);
    await ProductDetailScreen.waitForProduct();
    return product;
  },
};
