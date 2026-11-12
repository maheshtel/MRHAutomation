import { createLogger } from '../core/logger';
import { AccountScreen } from '../screens/AccountScreen';
import { TabBar } from '../screens/TabBar';
import { WishlistsScreen } from '../screens/WishlistsScreen';

const log = createLogger('wishlist');

export const WishlistFlow = {
  /** Account › My Lists. Requires a signed-in customer. */
  async openMyLists(): Promise<void> {
    await TabBar.open('Account');
    await AccountScreen.waitForSignedIn();
    await AccountScreen.openMyLists();
    await WishlistsScreen.waitForContent();
  },

  /** Names of the lists on My Lists that start with `prefix`. */
  async listsStartingWith(prefix: string): Promise<string[]> {
    await WishlistFlow.openMyLists();
    return (await WishlistsScreen.listNames()).filter((name) => name.startsWith(prefix));
  },

  /** Delete every list whose name starts with `prefix` (test leftovers). */
  async deleteListsStartingWith(prefix: string): Promise<string[]> {
    const names = await WishlistFlow.listsStartingWith(prefix);
    for (const name of names) {
      log.info(`Deleting list "${name}"`);
      await WishlistsScreen.deleteList(name);
    }
    return names;
  },

  /** Return an existing test list's name, creating `fallbackName` if none exists. */
  async ensureList(prefix: string, fallbackName: string): Promise<string> {
    const existing = await WishlistFlow.listsStartingWith(prefix);
    if (existing.length > 0) return existing[0];
    await WishlistsScreen.createList(fallbackName);
    return fallbackName;
  },
};
