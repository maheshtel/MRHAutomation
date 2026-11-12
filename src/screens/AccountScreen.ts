/**
 * Account tab root (src/screens/AccountScreen.tsx). Renders either the guest
 * view or the signed-in view under the same `account-screen` container.
 */
import { $ } from '@wdio/globals';
import { getLabel, isVisible, tap, waitForAny, waitForDisplayed } from '../core/elements';
import { scrollUntilVisible } from '../core/gestures';
import { by } from '../core/locators';
import { BaseScreen } from './BaseScreen';

export type AccountState = 'guest' | 'signedIn';

class AccountScreenObject extends BaseScreen {
  protected readonly screenName = 'Account';

  private readonly ids = {
    guestContent: 'account-guest-content',
    guestSignIn: 'account-guest-signin',
    signedInContent: 'account-logged-in-content',
    // Accessible summary card; its label is "Account: <first name>, <email>".
    accountCard: 'account-email-card',
    signOut: 'account-menu-sign-out',
    myLists: 'account-menu-my-lists',
  };

  protected root() {
    return by.testId('account-screen');
  }

  /** Wait for the account screen to settle and report which view it shows. */
  async state(timeout?: number): Promise<AccountState> {
    return waitForAny(
      {
        guest: by.testId(this.ids.guestContent),
        signedIn: by.testId(this.ids.signedInContent),
      },
      { timeout, name: 'Account guest or signed-in view' },
    );
  }

  async openSignIn(): Promise<void> {
    await tap(by.testId(this.ids.guestSignIn), { name: 'Account › Sign In' });
  }

  async isSignInButtonVisible(): Promise<boolean> {
    return isVisible(by.testId(this.ids.guestSignIn));
  }

  async isSignedInContentVisible(): Promise<boolean> {
    return isVisible(by.testId(this.ids.signedInContent));
  }

  async openMyLists(): Promise<void> {
    const item = await scrollUntilVisible(by.testId(this.ids.myLists), {
      name: 'Account › My Lists',
      maxSwipes: 4,
    });
    await item.click();
  }

  /** Tap Sign Out without waiting — for tests that assert the outcome themselves. */
  async tapSignOut(): Promise<void> {
    const button = await scrollUntilVisible(by.testId(this.ids.signOut), {
      name: 'Sign Out',
      maxSwipes: 8,
    });
    await button.click();
  }

  async waitForSignedIn(timeout = 60_000): Promise<void> {
    await waitForDisplayed(by.testId(this.ids.signedInContent), {
      timeout,
      name: 'signed-in Account view',
    });
  }

  async waitForGuest(timeout?: number): Promise<void> {
    await waitForDisplayed(by.testId(this.ids.guestContent), {
      timeout,
      name: 'guest Account view',
    });
  }

  /** The signed-in summary, e.g. "Account: Mahesh, user@example.com". */
  async accountSummary(): Promise<string> {
    await waitForDisplayed(by.testId(this.ids.accountCard), { name: 'account summary card' });
    return getLabel(await $(by.testId(this.ids.accountCard)).getElement());
  }

  /** Sign Out sits at the bottom of the menu, below the fold on most devices. */
  async signOut(): Promise<void> {
    await this.tapSignOut();
    await this.waitForGuest();
  }
}

export const AccountScreen = new AccountScreenObject();
