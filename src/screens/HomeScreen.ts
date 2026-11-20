/**
 * Home tab (src/screens/HomeScreen.tsx).
 *
 * Home is CMS-driven: which sections render, and in what order, comes from
 * WordPress at runtime, and each section's testID ends with its position
 * (`home-products-3`). Sections are therefore matched by pattern and found by
 * sweeping down the page once, so the checks hold however editors reorder it.
 */
import { $$, driver } from '@wdio/globals';
import { scroll } from '../core/gestures';
import { createLogger } from '../core/logger';
import { by, type Selector } from '../core/locators';
import { nodesWithTestId } from '../core/pageSource';
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

/**
 * Every section HomeScreen.tsx can render: a human name and the testID pattern
 * (regex source, full match). The same pattern drives the element selector and
 * the one-call page-source sweep in `findSections`.
 */
const SECTION_DEFS: Record<HomeSectionKey, { name: string; pattern: string }> = {
  topBanner: { name: 'Top banner', pattern: 'home-top-banner-[0-9]+' },
  heroSearch: { name: 'Hero search bar', pattern: 'home-top-banner-[0-9]+-search' },
  announcementBanner: {
    name: 'Announcement banner',
    pattern: 'home-announcement-banner-[0-9]+-[0-9]+',
  },
  imageBanner: { name: 'Image banner', pattern: 'home-image-banner-[0-9]+' },
  whatsNew: { name: "What's New", pattern: 'home-whats-new-[0-9]+' },
  categories: { name: 'Top categories', pattern: 'top-categories-[0-9]+' },
  subCategories: { name: 'Sub-categories', pattern: 'home-subcategories-[0-9]+' },
  recentlyViewed: { name: 'Recently viewed', pattern: 'home-recently-viewed-[0-9]+' },
  purchaseAgain: { name: 'Purchase again', pattern: 'home-purchase-again-[0-9]+' },
  productShelf: { name: 'Product shelf', pattern: 'home-products-[0-9]+' },
  brandFooter: { name: 'Brand footer', pattern: 'home-brand-footer' },
};

/** Human names + selectors for every section HomeScreen.tsx can render. */
export const HOME_SECTIONS = Object.fromEntries(
  Object.entries(SECTION_DEFS).map(([key, { name, pattern }]) => [
    key,
    {
      name,
      selector: (): Selector =>
        pattern.includes('[') ? by.testIdMatches(pattern) : by.testId(pattern),
    },
  ]),
) as Record<HomeSectionKey, { name: string; selector: () => Selector }>;

const SECTION_KEYS = Object.keys(SECTION_DEFS) as HomeSectionKey[];
const SECTION_REGEX = SECTION_KEYS.map((key) => ({
  key,
  regex: new RegExp(`^${SECTION_DEFS[key].pattern}$`),
}));
/** Any section root, for one page-source scan. */
const ANY_SECTION = new RegExp(
  `^(?:${SECTION_KEYS.map((key) => SECTION_DEFS[key].pattern).join('|')})$`,
);
const PRODUCT_CARD = /^home-product-card-[0-9]+$/;
/** The screen root or a top banner: what `waitForContent` looks for. */
const HOME_CONTENT_PROBE = new RegExp(`^(?:home-screen|${SECTION_DEFS.topBanner.pattern})$`);


class HomeScreenObject extends BaseScreen {
  protected readonly screenName = 'Home';

  protected root() {
    return by.testId('home-screen');
  }

  /**
   * Wait until Home is showing and CMS content has replaced the loading
   * skeleton. The top banner is the first section in the published layout and
   * only renders with content.
   *
   * Polled with one page source per check, not element queries: both nodes
   * are non-accessible on iOS (find + displayed + accessible + rect each), and
   * on a CI Mac those queries against Home took ~75 s; a page source takes
   * 3–10 s there and well under a second on Android.
   */
  async waitForContent(timeout = 60_000): Promise<void> {
    const topBanner = new RegExp(`^${SECTION_DEFS.topBanner.pattern}$`);
    await driver.waitUntil(
      async () => {
        const ids = (await nodesWithTestId(HOME_CONTENT_PROBE)).map((node) => node.testId);
        return ids.includes('home-screen') && ids.some((id) => topBanner.test(id));
      },
      {
        timeout,
        interval: 500,
        timeoutMsg: 'Expected the Home screen with its top banner (CMS content loaded)',
      },
    );
  }

  /**
   * Sweep from the current position towards the bottom of Home, recording every
   * section seen on the way. Stops once all `wanted` sections are found or the
   * brand footer (always last) has been reached.
   *
   * Each position is read with ONE page-source call (src/core/pageSource.ts)
   * instead of a find + visibility check per section: on iOS every query
   * re-snapshots Home's large tree, so 11 section queries per swipe cost
   * minutes on a CI agent; one page source costs seconds.
   */
  async findSections(wanted: HomeSectionKey[], maxSwipes = 14): Promise<Set<HomeSectionKey>> {
    const seen = new Set<HomeSectionKey>();

    for (let swipe = 0; swipe <= maxSwipes; swipe += 1) {
      for (const node of await nodesWithTestId(ANY_SECTION)) {
        for (const { key, regex } of SECTION_REGEX) {
          if (!seen.has(key) && regex.test(node.testId)) {
            seen.add(key);
            log.info(`Section visible: ${SECTION_DEFS[key].name}`);
          }
        }
      }
      if (wanted.every((key) => seen.has(key)) || seen.has('brandFooter')) break;
      if (swipe < maxSwipes) await scroll('down', 0.5);
    }
    return seen;
  }

  async visibleProductCardCount(): Promise<number> {
    return (await nodesWithTestId(PRODUCT_CARD)).length;
  }

  /** Scroll until a product shelf with at least one product card is on screen. */
  async scrollToProductShelf(maxSwipes = 8): Promise<void> {
    for (let i = 0; i <= maxSwipes; i += 1) {
      const ids = (await nodesWithTestId(/^home-(?:products|product-card)-[0-9]+$/)).map(
        (node) => node.testId,
      );
      if (ids.some((id) => /^home-products-/.test(id)) && ids.some((id) => PRODUCT_CARD.test(id))) {
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
