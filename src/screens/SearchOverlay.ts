/**
 * Search overlay (src/context/searchOverlayContext.tsx → SearchBarOverlayView).
 *
 *   search-overlay-sheet   full-screen top sheet
 *   search-bar-input       the TextInput (SearchBar → DSSearchBar `<testID>-input`)
 *
 * Typeahead rows (DSSearchSection) carry no testID. Their accessibility label is
 * built from the data, which is stable enough to target:
 *   product, in stock   "<title>, <price range>"   e.g. "Lavender Flowers, $5.00 - $40.00"
 *   product, sold out   "<title>, Out of stock"
 *   category            "<title>, <n> items"
 *   suggestion          "Search for <term>"
 *   view-all button     "View all <n> results for <query>"
 * Only an in-stock product row contains "$<digit>", which is what we match.
 */
import { driver } from '@wdio/globals';
import { env } from '../../config/env';
import { getLabel, hideKeyboard, typeText, waitForFirstVisible } from '../core/elements';
import { createLogger } from '../core/logger';
import { by, escapeRegex } from '../core/locators';
import { BaseScreen } from './BaseScreen';

const log = createLogger('search');

export interface SearchProduct {
  /** Product title as shown in the typeahead row. */
  title: string;
  /** Full accessibility label of the row (title + price). */
  label: string;
}

/** "Lavender, French, $1,200.00 - $9.00" → "Lavender, French". */
export const titleFromRowLabel = (label: string): string =>
  label.replace(/,\s[^,]*\$[0-9].*$/, '').trim();

class SearchOverlayObject extends BaseScreen {
  protected readonly screenName = 'Search';

  protected root() {
    return by.testId('search-overlay-sheet');
  }

  private input() {
    return by.testId('search-bar-input');
  }

  private inStockProductRows(term: string) {
    return by.labelMatches(`.*${escapeRegex(term)}.*[$][0-9].*`, { caseInsensitive: true });
  }

  async search(term: string): Promise<void> {
    await this.waitForLoaded();
    await typeText(this.input(), term, { name: 'Search input' });
  }

  /**
   * Wait for the typeahead to list an in-stock product matching `term`, then
   * open the first one. Returns what was tapped so the test can follow it.
   */
  async openFirstInStockProduct(
    term: string,
    timeout = env.run.waitTimeout,
  ): Promise<SearchProduct> {
    const first = await waitForFirstVisible(this.inStockProductRows(term), {
      timeout,
      name: `in-stock product result for "${term}"`,
    });
    const label = await getLabel(first);
    const product = { title: titleFromRowLabel(label), label };
    log.info('Opening search result', product);

    // The keyboard can cover the lower rows on small screens; the first row is
    // at the top of the list, but hiding it keeps the tap unambiguous.
    await hideKeyboard();
    await first.click();
    await driver.waitUntil(async () => !(await this.isLoaded()), {
      timeout: 15_000,
      timeoutMsg: 'Search overlay did not close after opening a product',
    });
    return product;
  }
}

export const SearchOverlay = new SearchOverlayObject();
