/**
 * Feature: Shop navigation
 *
 *   Scenario: The Shop menu shows the Category and Function sections
 *     Given the app is open on the Home tab
 *     When I tap the Shop tab
 *     Then the Shop page loads with its title and Quick Shop links
 *     And the "Shop by" section offers Category and Function tabs
 *     And the Category tab is selected and lists categories
 *     When I tap the Function tab
 *     Then the Function tab is selected and lists functions
 */
import { addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { And, Given, Then, When } from '../../src/core/bdd';
import { HomeScreen } from '../../src/screens/HomeScreen';
import { ShopScreen } from '../../src/screens/ShopScreen';
import { TabBar } from '../../src/screens/TabBar';

describe('Feature: Shop navigation @smoke', () => {
  it('Scenario: The Shop menu shows the Category and Function sections', async () => {
    await addFeature('Navigation');
    await addSeverity('critical');

    await Given('the app is open on the Home tab', async () => {
      await TabBar.open('Home');
      await HomeScreen.waitForLoaded();
    });

    await When('I tap the Shop tab', async () => {
      await TabBar.open('Shop');
      await ShopScreen.waitForContent();
    });

    await Then('the Shop page loads with its title and Quick Shop links', async () => {
      expect(await ShopScreen.title()).toBe('Shop');
      expect(await ShopScreen.isQuickShopVisible()).toBe(true);
    });

    await And('the "Shop by" section offers Category and Function tabs', async () => {
      await ShopScreen.scrollToShopBy();
      expect(await ShopScreen.isTabVisible('Category')).toBe(true);
      expect(await ShopScreen.isTabVisible('Function')).toBe(true);
    });

    await And('the Category tab is selected and lists categories', async () => {
      expect(await ShopScreen.isTabSelected('Category')).toBe(true);
      await ShopScreen.waitForPane('Category');
      expect(await ShopScreen.visibleTreeNodeCount('Category')).toBeGreaterThan(0);
    });

    await When('I tap the Function tab', async () => {
      await ShopScreen.selectTab('Function');
    });

    await Then('the Function tab is selected and lists functions', async () => {
      expect(await ShopScreen.isTabSelected('Function')).toBe(true);
      expect(await ShopScreen.isTabSelected('Category')).toBe(false);
      expect(await ShopScreen.isPaneVisible('Function')).toBe(true);
      expect(await ShopScreen.visibleTreeNodeCount('Function')).toBeGreaterThan(0);
    });
  });
});
