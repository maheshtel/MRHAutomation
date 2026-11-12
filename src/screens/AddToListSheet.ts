/**
 * "Add to List" sheet opened from the product page
 * (components/wishlist/DSWishlistSheet.tsx, default testID add-to-wishlist-modal).
 *
 *   add-to-wishlist-modal-item-<id>   checkbox per list; label = list name
 *   add-to-wishlist-modal-add-button  confirm
 */
import { tap, waitForDisplayed, waitForGone } from '../core/elements';
import { by } from '../core/locators';
import { BaseScreen } from './BaseScreen';

class AddToListSheetObject extends BaseScreen {
  protected readonly screenName = 'Add to List';

  private readonly ids = {
    sheet: 'add-to-wishlist-modal',
    addButton: 'add-to-wishlist-modal-add-button',
  };

  protected root() {
    return by.testId(this.ids.addButton);
  }

  async addToList(listName: string): Promise<void> {
    await waitForDisplayed(by.label(listName), { name: `list "${listName}" in Add to List` });
    await tap(by.label(listName), { name: `select list "${listName}"` });
    await tap(by.testId(this.ids.addButton), { name: 'Add to List › confirm' });
    await waitForGone(by.testId(this.ids.addButton), {
      timeout: 30_000,
      name: 'Add to List sheet',
    });
  }
}

export const AddToListSheet = new AddToListSheetObject();
