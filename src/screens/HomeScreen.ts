/**
 * Home tab (src/screens/HomeScreen.tsx).
 *
 * Home is CMS-driven: which sections render, and in what order, comes from
 * WordPress at runtime, and each section's testID ends with its position
 * (`home-products-3`). Sections are therefore matched by pattern and found by
 * sweeping down the page once, so the checks hold however editors reorder it.
 */
import { $$ } from '@wdio/globals';
import { countVisible, isVisible, waitForFirstVisible } from '../core/elements';
import { scroll } from '../core/gestures';
import { createLogger } from '../core/logger';
import { by, type Selector } from '../core/locators';
import { BaseScreen } from './BaseScreen';

const log = createLogger('home');

export type HomeSectionKey =
  | 'topBanner'
  | 'heroSearch'
  | 'announcementBanner'
  | 'imageBanner'
  | 'whatsNew'
  | 'categories'
  | 'subCategories'
  | 'recentlyViewed'
  | 'purchaseAgain'
  | 'productShelf'
  | 'brandFooter';

/** Human names + selectors for every section HomeScreen.tsx can render. */
export const HOME_SECTIONS: Record<HomeSectionKey, { name: string; selector: () => Selector }> = {
  topBanner: { name: 'Top banner', selector: () => by.testIdMatches('home-top-banner-[0-9]+') },
  heroSearch: {
    name: 'Hero search bar',
    selector: () => by.testIdMatches('home-top-banner-[0-9]+-search'),
  },
  announcementBanner: {
    name: 'Announcement banner',
    selector: () => by.testIdMatches('home-announcement-banner-[0-9]+-[0-9]+'),
  },
  imageBanner: {
    name: 'Image banner',
    selector: () => by.testIdMatches('home-image-banner-[0-9]+'),
  },
  whatsNew: { name: "What's New", selector: () => by.testIdMatches('home-whats-new-[0-9]+') },
  categories: { name: 'Top categories', selector: () => by.testIdMatches('top-categories-[0-9]+') },
  subCategories: {
    name: 'Sub-categories',
    selector: () => by.testIdMatches('home-subcategories-[0-9]+'),
  },
  recentlyViewed: {
    name: 'Recently viewed',
    selector: () => by.testIdMatches('home-recently-viewed-[0-9]+'),
  },
  purchaseAgain: {
    name: 'Purchase again',
    selector: () => by.testIdMatches('home-purchase-again-[0-9]+'),
  },
  productShelf: { name: 'Product shelf', selector: () => by.testIdMatches('home-products-[0-9]+') },
  brandFooter: { name: 'Brand footer', selector: () => by.testId('home-brand-footer') },
};

/** Product cards: `home-product-card-<numeric id>` (children add -badge/-cart suffixes). */
const productCard = () => by.testIdMatches('home-product-card-[0-9]+');

class HomeScreenObject extends BaseScreen {
  protected readonly screenName = 'Home';

  protected root() {
    return by.testId('home-screen');
  }

  /**
   * Wait until CMS content has replaced the loading skeleton. The top banner is
   * the first section in the published layout and only renders with content.
   */
  async waitForContent(timeout = 60_000): Promise<void> {
    await this.waitForLoaded(timeout);
    await waitForFirstVisible(HOME_SECTIONS.topBanner.selector(), {
      timeout,
      name: 'Home top banner (content loaded)',
    });
  }

  /**
   * Sweep from the current position towards the bottom of Home, recording every
   * section seen on the way. Stops once all `wanted` sections are found or the
   * brand footer (always last) has been reached.
   */
  async findSections(wanted: HomeSectionKey[], maxSwipes = 14): Promise<Set<HomeSectionKey>> {
    const seen = new Set<HomeSectionKey>();
    const all = Object.keys(HOME_SECTIONS) as HomeSectionKey[];

    for (let swipe = 0; swipe <= maxSwipes; swipe += 1) {
      for (const key of all) {
        if (!seen.has(key) && (await isVisible(HOME_SECTIONS[key].selector()))) {
          seen.add(key);
          log.info(`Section visible: ${HOME_SECTIONS[key].name}`);
        }
      }
      if (wanted.every((key) => seen.has(key)) || seen.has('brandFooter')) break;
      if (swipe < maxSwipes) await scroll('down', 0.5);
    }
    return seen;
  }

  async visibleProductCardCount(): Promise<number> {
    return countVisible(productCard());
  }

  /** Scroll until a product shelf with at least one product card is on screen. */
  async scrollToProductShelf(maxSwipes = 8): Promise<void> {
    for (let i = 0; i <= maxSwipes; i += 1) {
      if (
        (await isVisible(HOME_SECTIONS.productShelf.selector())) &&
        (await this.visibleProductCardCount()) > 0
      ) {
        return;
      }
      if (i < maxSwipes) await scroll('down', 0.4);
    }
    throw new Error('No product shelf with product cards was found on Home');
  }

  /** Visible section headings, attached to the report for context. */
  async visibleSectionTitles(): Promise<string[]> {
    const titles = await $$(
      by.testIdMatches('home-(product|category|subcategory|rv|pa)-title-[0-9]+'),
    ).getElements();
    const texts: string[] = [];
    for (const title of titles) texts.push(await title.getText().catch(() => ''));
    return texts.filter(Boolean);
  }
}

export const HomeScreen = new HomeScreenObject();
