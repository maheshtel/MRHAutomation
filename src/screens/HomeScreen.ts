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
import { NotRetryableError } from '../core/errors';
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
   * 0.5–10 s there and well under a second on Android.
   */
  async waitForContent(timeout = 60_000): Promise<void> {
    return this.waitForContentWithRecovery(timeout);
  }

  /**
   * The check above, plus the recovery a user would make when the content
   * never arrives. Both platforms (iOS since 2026-11-27).
   *
   * iOS, 2026-11-27 CI: login failed on all 4 attempts (05:15–05:38 UTC) with
   * Home on the same "Loading home" skeleton. The simulator was fast (page
   * source 0.5–3 s, ~60 checks per attempt), so the content never arrived.
   * The iOS release build writes no JS log to the simulator log, so the
   * rejection itself is not visible there.
   *
   * The content API intermittently returns a home "shell" whose mobile-pages
   * section is empty. The app rejects it ("home content shell rejected" in the
   * device log), and a fresh install has no saved copy to fall back on, so Home
   * keeps its loading skeleton ("Loading home") until something fetches again:
   * Home only refetches on focus after a sign-in/out, or on a pull-to-refresh.
   * Seen locally (3 of 4 refetches in 30 s rejected) and on CI: on 2026-11-24
   * every one of 18 fetches between 10:51 and 11:11 UTC was rejected, and the
   * first good shell came ~11:12.
   *
   * Still the skeleton after the first wait → pull to refresh every
   * PULL_WAIT_MS (a content fetch takes 1–25 s on CI), for up to
   * CONTENT_RECOVERY_TIMEOUT. Each pull is logged at info level, so the Allure
   * report shows it. Still nothing → NotRetryableError naming the cause: a
   * Mocha retry would only restart the app and sign in again (3–4 min on CI)
   * to wait longer, which this loop already does more cheaply. The defect
   * itself is the API's / app's to fix.
   */
  private async waitForContentWithRecovery(timeout: number): Promise<void> {
    const PULL_WAIT_MS = Math.min(env.run.waitTimeout, 30_000);
    const budget = env.run.contentRecoveryTimeout;
    let state = await this.homeContentWithin(timeout);
    const started = Date.now();
    let pulls = 0;
    while (state === 'skeleton' && Date.now() - started < budget) {
      pulls += 1;
      log.info(
        'Home is still on its loading skeleton: the app rejected the content the API sent ' +
          `(device log: "home content shell rejected"). Pull to refresh #${pulls}, as a user ` +
          `would (recovering for up to ${Math.round(budget / 1000)}s).`,
      );
      await this.pullToRefresh();
      state = await this.homeContentWithin(PULL_WAIT_MS);
    }
    if (state === 'loaded') {
      if (pulls > 0) log.info(`Home content loaded after ${pulls} pull(s) to refresh`);
      return;
    }
    if (state === 'skeleton') {
      throw new NotRetryableError(
        `Home content never loaded: the screen still shows the loading skeleton ("Loading home") ` +
          `after ${pulls} pulls to refresh over ${Math.round((Date.now() - started) / 1000)}s. ` +
          'The content API (GET /api/secure/contents?group_content_key=content_home) kept ' +
          'returning a home shell with an empty mobile-pages section, which the app rejects ' +
          '(Android: see "home content shell rejected" in logs/device/logcat.txt). Backend fault: not retried.',
      );
    }
    throw new Error('Expected the Home screen with its top banner (CMS content loaded)');
  }

  /**
   * One page source per check: 'loaded' (root + top banner), 'skeleton'
   * (Loading home), or 'other'. The testID is `resource-id` on Android and
   * `name` on iOS; the skeleton's label is `content-desc` / `name`.
   */
  private async homeContentWithin(timeout: number): Promise<'loaded' | 'skeleton' | 'other'> {
    const topBanner = new RegExp(`^${SECTION_DEFS.topBanner.pattern}$`);
    const idPattern = isAndroid() ? /resource-id="([^"]*)"/g : /\bname="([^"]*)"/g;
    const skeleton = isAndroid() ? 'content-desc="Loading home"' : 'name="Loading home"';
    const deadline = Date.now() + timeout;
    let state: 'loaded' | 'skeleton' | 'other' = 'other';
    do {
      const source = await driver.getPageSource();
      const ids = [...source.matchAll(idPattern)].map((match) => match[1]);
      if (ids.includes('home-screen') && ids.some((id) => topBanner.test(id))) return 'loaded';
      state = source.includes(skeleton) ? 'skeleton' : 'other';
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
