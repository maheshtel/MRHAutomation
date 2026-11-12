/**
 * My Lists (src/screens/WishlistsScreen.tsx + components/wishlist/*).
 *
 *   wishlists-list                    FlatList (rendered once loaded, even when empty)
 *   wishlists-empty / -empty-create   empty state + its "Create list" button
 *   new-list-button                   "+ New List" (only shown when lists exist)
 *   wishlist-card-<id>                list card; label "<name>, N item(s)"
 *   wishlist-card-<id>-delete         Delete action inside the card
 *   wishlist-form-sheet[-input|-submit]   create / rename sheet
 *   wishlist-delete-sheet[-confirm]       delete confirmation sheet
 *
 * The list is virtualised and paginated: only cards on screen exist in the
 * view hierarchy, and more load as you near the end. Lookups therefore scan
 * from the top to the real end of the list. Lists are found by NAME (via the
 * card label) because their ids are server generated.
 *
 * The card is an accessible Pressable, so on iOS its Delete action is reached
 * through src/core/nested.ts.
 */
import { $, driver } from '@wdio/globals';
import { env } from '../../config/env';
import {
  hideKeyboard,
  isVisible,
  tap,
  typeText,
  waitForAny,
  waitForDisplayed,
  waitForGone,
} from '../core/elements';
import { bringAboveTabBar, scroll } from '../core/gestures';
import { createLogger } from '../core/logger';
import { by } from '../core/locators';
import { type EdgeOffset, tapNested } from '../core/nested';
import { nodesWithTestId } from '../core/pageSource';
import { BaseScreen } from './BaseScreen';

const log = createLogger('lists');

/**
 * iOS fallback for the card's Delete action (rightmost of Rename · Share ·
 * Delete), in points from the card's edges. Measured on Android with
 * E2E_LOG_LEVEL=debug.
 */
const CARD_DELETE: EdgeOffset = { fromRight: 41, fromBottom: 37 };

const CARD_ID = /^wishlist-card-[0-9]+$/;
const MAX_SCAN_SWIPES = 30;

/** "Summer Teas, 3 items" → { name: "Summer Teas", count: 3 } */
export const parseCardLabel = (label: string) => {
  const match = label.match(/^(.*), (\d+) items?$/);
  return match ? { name: match[1], count: Number(match[2]) } : { name: label, count: 0 };
};

interface Card {
  id: string;
  name: string;
  count: number;
}

class WishlistsScreenObject extends BaseScreen {
  protected readonly screenName = 'My Lists';

  private readonly ids = {
    list: 'wishlists-list',
    empty: 'wishlists-empty',
    newList: 'new-list-button',
    emptyCreate: 'wishlists-empty-create',
    formInput: 'wishlist-form-sheet-input',
    formSubmit: 'wishlist-form-sheet-submit',
    deleteConfirm: 'wishlist-delete-sheet-confirm',
  };

  protected root() {
    return by.testId(this.ids.list);
  }

  /**
   * Wait until the lists have loaded: at least one card, or the empty state.
   * The FlatList itself renders before its data arrives, so its presence alone
   * would let a scan conclude "no lists" too early.
   */
  async waitForContent(timeout = 60_000): Promise<'lists' | 'empty'> {
    await this.waitForLoaded(timeout);
    return waitForAny(
      { lists: by.testIdMatches('wishlist-card-[0-9]+'), empty: by.testId(this.ids.empty) },
      { timeout, name: 'list cards or the empty state' },
    );
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  /** Cards on screen, read from one page-source call (see src/core/pageSource.ts). */
  private async visibleCards(): Promise<Card[]> {
    const nodes = await nodesWithTestId(CARD_ID);
    return nodes.map(({ testId, label }) => ({ id: testId, ...parseCardLabel(label) }));
  }

  private async element(card: Card): Promise<WebdriverIO.Element> {
    return $(by.testId(card.id)).getElement();
  }

  private signature = (cards: Card[]) => cards.map((c) => c.id).join('|');

  /**
   * Cards on screen, waiting briefly while the list shows none — e.g. during
   * the pull-to-refresh a swipe at the top triggers — so an in-flight reload
   * is never mistaken for "no more lists".
   */
  private async settledCards(): Promise<Card[]> {
    const deadline = Date.now() + 10_000;
    let cards = await this.visibleCards();
    while (cards.length === 0 && Date.now() < deadline) {
      if (await isVisible(by.testId(this.ids.empty))) break;
      await driver.pause(500);
      cards = await this.visibleCards();
    }
    return cards;
  }

  /** Swipe up until the visible cards stop changing (top reached). */
  private async scrollToTop(): Promise<void> {
    let previous = this.signature(await this.settledCards());
    for (let i = 0; i < MAX_SCAN_SWIPES; i += 1) {
      await scroll('up', 0.6);
      const current = this.signature(await this.settledCards());
      if (current === previous) return;
      previous = current;
    }
  }

  /**
   * Find a card, or walk the whole list. Checks the cards already on screen
   * first (back-to-back steps on the same list then need no scrolling), then
   * scans from the top. Stops when `visit` returns true or the list stops
   * moving (the end, after giving pagination a moment to append more).
   */
  private async scan(visit: (card: Card) => boolean): Promise<Card | undefined> {
    const onScreen = (await this.settledCards()).find(visit);
    if (onScreen) return onScreen;

    await this.scrollToTop();
    let previous = '';
    let stillCount = 0;
    for (let i = 0; i < MAX_SCAN_SWIPES; i += 1) {
      const cards = await this.settledCards();
      const hit = cards.find(visit);
      if (hit) return hit;
      const current = this.signature(cards);
      if (current === previous) {
        stillCount += 1;
        if (stillCount >= 2) return undefined;
        await driver.pause(1500); // the next page may still be loading
      } else {
        stillCount = 0;
      }
      previous = current;
      await scroll('down', 0.5);
    }
    return undefined;
  }

  private async findCard(name: string): Promise<Card | undefined> {
    const card = await this.scan((c) => c.name === name);
    if (card) await bringAboveTabBar(await this.element(card));
    return card;
  }

  private async requireCard(name: string): Promise<Card> {
    const card = await this.findCard(name);
    if (!card) throw new Error(`List "${name}" is not in My Lists`);
    return card;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  async hasList(name: string): Promise<boolean> {
    return (await this.findCard(name)) !== undefined;
  }

  /** Every list name on the account (scans the whole list). */
  async listNames(): Promise<string[]> {
    const names = new Set<string>();
    await this.scan((card) => {
      names.add(card.name);
      return false;
    });
    return [...names];
  }

  async itemCount(name: string): Promise<number> {
    return (await this.requireCard(name)).count;
  }

  async waitForItemCount(name: string, expected: number, timeout = env.run.waitTimeout) {
    let last = -1;
    await driver.waitUntil(
      async () => {
        last = (await this.findCard(name))?.count ?? -1;
        return last === expected;
      },
      {
        timeout,
        interval: 1000,
        timeoutMsg: `Expected list "${name}" to hold ${expected} item(s), last saw ${last}`,
      },
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * "+ New List" sits in a fixed header ABOVE the FlatList (shown only while
   * lists exist); with no lists the empty state's "Create list" button is the
   * entry point instead. No scrolling is needed to reach either one. Scrolling
   * here used to be harmful: a swipe up at the top of the list starts a
   * pull-to-refresh, the header briefly unmounts, and an instant check would
   * then wrongly pick the empty-state button and time out waiting for it.
   * So wait for whichever entry point actually appears.
   */
  async createList(name: string): Promise<void> {
    await this.waitForContent();
    const entry = await waitForAny(
      { header: by.testId(this.ids.newList), empty: by.testId(this.ids.emptyCreate) },
      { name: '"+ New List" or the empty-state "Create list" button' },
    );
    await tap(by.testId(entry === 'header' ? this.ids.newList : this.ids.emptyCreate), {
      name: entry === 'header' ? '"+ New List" button' : 'empty-state "Create list" button',
    });
    await typeText(by.testId(this.ids.formInput), name, { name: 'List name field' });
    await hideKeyboard();
    await tap(by.testId(this.ids.formSubmit), { name: 'Create list button' });
    await waitForGone(by.testId(this.ids.formInput), { name: 'create list sheet' });
    log.info(`Created list "${name}"`);
  }

  async openList(name: string): Promise<void> {
    await (await this.element(await this.requireCard(name))).click();
  }

  async deleteList(name: string): Promise<void> {
    const card = await this.requireCard(name);
    await tapNested(await this.element(card), `${card.id}-delete`, CARD_DELETE, `Delete "${name}"`);
    await waitForDisplayed(by.testId(this.ids.deleteConfirm), { name: 'delete confirmation' });
    await tap(by.testId(this.ids.deleteConfirm), { name: 'Confirm delete' });
    await waitForGone(by.testId(this.ids.deleteConfirm), { name: 'delete confirmation' });
    await driver.waitUntil(async () => !(await isVisible(by.testId(card.id))), {
      timeout: env.run.waitTimeout,
      interval: 500,
      timeoutMsg: `List "${name}" is still shown after deleting it`,
    });
    log.info(`Deleted list "${name}"`);
  }
}

export const WishlistsScreen = new WishlistsScreenObject();
