/**
 * Shop tab root (src/screens/ShopScreen.tsx).
 *
 *   shop-screen-header                 DSScreenHeader (title "Shop", search button)
 *   shop-quick-shop-section            Quick Shop chips
 *   shop-by-section                    "Shop by" section
 *     shop-by-tabs-tab-Category        segmented tab (DSContentTabBar)
 *     shop-by-tabs-tab-Function        segmented tab
 *     shop-category-list-category      Category pane  → tree shop-category-tree-category-*
 *     shop-category-list-function      Function pane  → tree shop-category-tree-function-*
 *     shop-all-button                  "Shop all" CTA (Category pane only)
 *
 * Both panes stay mounted (the tab bar is swipeable); only the active one is on
 * screen, so "displayed" is the meaningful check rather than "exists".
 */
import { $ } from '@wdio/globals';
import { countVisible, isVisible, tap, waitForDisplayed } from '../core/elements';
import { scrollUntilVisible } from '../core/gestures';
import { by } from '../core/locators';
import { BaseScreen } from './BaseScreen';

export type ShopByTab = 'Category' | 'Function';

class ShopScreenObject extends BaseScreen {
  protected readonly screenName = 'Shop';

  private readonly ids = {
    header: 'shop-screen-header',
    headerTitle: 'shop-screen-header-title',
    searchButton: 'shop-screen-header-search-button',
    scroll: 'shop-screen-scroll',
    quickShop: 'shop-quick-shop-section',
    shopBy: 'shop-by-section',
    shopAll: 'shop-all-button',
  };

  protected root() {
    return by.testId(this.ids.header);
  }

  private tab(tab: ShopByTab) {
    return by.testId(`shop-by-tabs-tab-${tab}`);
  }

  private pane(tab: ShopByTab) {
    return by.testId(`shop-category-list-${tab.toLowerCase()}`);
  }

  /** Tree rows of a pane: `shop-category-tree-<tab>-<nodeId>[-toggle|-leaf|-<childId>]`. */
  private treeNodes(tab: ShopByTab) {
    return by.testIdStartsWith(`shop-category-tree-${tab.toLowerCase()}-`);
  }

  /** Header + scroll view + the category tree data (skeleton gone). */
  async waitForContent(timeout = 60_000): Promise<void> {
    await this.waitForLoaded(timeout);
    await waitForDisplayed(by.testId(this.ids.scroll), { timeout, name: 'Shop content' });
  }

  async title(): Promise<string> {
    return $(by.testId(this.ids.headerTitle)).getText();
  }

  async isQuickShopVisible(): Promise<boolean> {
    return isVisible(by.testId(this.ids.quickShop));
  }

  /** Bring the "Shop by" tabs on screen. */
  async scrollToShopBy(): Promise<void> {
    await scrollUntilVisible(this.tab('Category'), {
      name: 'Shop by › Category tab',
      maxSwipes: 5,
    });
  }

  async isTabVisible(tab: ShopByTab): Promise<boolean> {
    return isVisible(this.tab(tab));
  }

  async isTabSelected(tab: ShopByTab): Promise<boolean> {
    return $(this.tab(tab)).isSelected();
  }

  async selectTab(tab: ShopByTab): Promise<void> {
    await tap(this.tab(tab), { name: `Shop by › ${tab} tab` });
    await waitForDisplayed(this.pane(tab), { name: `${tab} pane` });
  }

  async isPaneVisible(tab: ShopByTab): Promise<boolean> {
    return isVisible(this.pane(tab));
  }

  async waitForPane(tab: ShopByTab): Promise<void> {
    await waitForDisplayed(this.pane(tab), { name: `${tab} pane` });
  }

  /** Visible tree rows in a pane (each category contributes a node + its row). */
  async visibleTreeNodeCount(tab: ShopByTab): Promise<number> {
    return countVisible(this.treeNodes(tab));
  }

  async isShopAllVisible(): Promise<boolean> {
    return isVisible(by.testId(this.ids.shopAll));
  }

  async openSearch(): Promise<void> {
    await tap(by.testId(this.ids.searchButton), { name: 'Shop › search button' });
  }
}

export const ShopScreen = new ShopScreenObject();
