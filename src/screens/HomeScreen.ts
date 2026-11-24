/**
 * Home tab (src/screens/HomeScreen.tsx).
 *
 * Home is CMS-driven: which sections render, and in what order, comes from
 * WordPress at runtime, and each section's testID ends with its position
 * (`home-products-3`). Sections are therefore matched by pattern and found by
 * sweeping down the page once, so the checks hold however editors reorder it.
 */
import { $$, driver } from '@wdio/globals';
import { env } from '../../config/env';
import { screenSize } from '../core/elements';
import { scroll, swipe } from '../core/gestures';
import { createLogger } from '../core/logger';
import { by, type Selector } from '../core/locators';
import { nodesWithTestId } from '../core/pageSource';
import { isAndroid } from '../core/platform';
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
    if (isAndroid()) return this.waitForContentAndroid(timeout);
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
   * Android: the same check, plus the recovery a user would make when the
   * content never arrives.
   *
   * The content API intermittently returns a home "shell" whose mobile-pages
   * section is empty. The app rejects it ("home content shell rejected" in the
   * device log), and a fresh install has no saved copy to fall back on, so Home
   * keeps its loading skeleton ("Loading home") until something fetches again:
   * Home only refetches on focus after a sign-in/out, or on a pull-to-refresh.
   * Seen on CI (2026-11-24, both attempts) and locally, where 3 of 4 refetches
   * in 30 s were rejected. On CI a page source takes 11–33 s, so the first
   * window is the run's wait budget, not a fixed 60 s.
   *
   * Still the skeleton → pull to refresh (each pull logged, so the report shows
   * the backend fault) and wait again, at most PULLS times. Still nothing →
   * fail naming the cause. The defect itself is the app's / API's to fix.
   */
  private async waitForContentAndroid(timeout: number): Promise<void> {
    const PULLS = 3;
    let state = await this.homeContentWithin(Math.max(timeout, 2 * env.run.waitTimeout));
    for (let pull = 1; state === 'skeleton' && pull <= PULLS; pull += 1) {
      log.warn(
        `Home is still on its loading skeleton: the app rejected the content the API sent ` +
          `(device log: "home content shell rejected"). Pull to refresh ${pull}/${PULLS}, as a user would.`,
      );
      await this.pullToRefresh();
      state = await this.homeContentWithin(env.run.waitTimeout);
    }
    if (state === 'loaded') return;
    throw new Error(
      state === 'skeleton'
        ? `Home content never loaded, even after ${PULLS} pulls to refresh: the screen still shows ` +
            'the loading skeleton ("Loading home"). The content API keeps returning an invalid home ' +
            'shell (see "home content shell rejected" in logs/device/logcat.txt).'
        : 'Expected the Home screen with its top banner (CMS content loaded)',
    );
  }

  /** One page source per check: 'loaded' (root + top banner), 'skeleton' (Loading home), or 'other'. */
  private async homeContentWithin(timeout: number): Promise<'loaded' | 'skeleton' | 'other'> {
    const topBanner = new RegExp(`^${SECTION_DEFS.topBanner.pattern}$`);
    const deadline = Date.now() + timeout;
    let state: 'loaded' | 'skeleton' | 'other' = 'other';
    do {
      const source = await driver.getPageSource();
      const ids = [...source.matchAll(/resource-id="([^"]*)"/g)].map((match) => match[1]);
      if (ids.includes('home-screen') && ids.some((id) => topBanner.test(id))) return 'loaded';
      state = source.includes('content-desc="Loading home"') ? 'skeleton' : 'other';
      await driver.pause(500);
    } while (Date.now() < deadline);
    return state;
  }

  /** Pull Home down from near its top: the app's RefreshControl refetches the content. */
  private async pullToRefresh(): Promise<void> {
    const { width, height } = await screenSize();
    await swipe({ x: width / 2, y: height * 0.3 }, { x: width / 2, y: height * 0.75 }, 700);
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
