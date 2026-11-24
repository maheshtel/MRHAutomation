/**
 * Account tab root (src/screens/AccountScreen.tsx). Renders either the guest
 * view or the signed-in view under the same `account-screen` container.
 */
import { $ } from '@wdio/globals';
import { env } from '../../config/env';
import {
  appearsWithin,
  getLabel,
  isVisible,
  tap,
  waitForAny,
  waitForDisplayed,
} from '../core/elements';
import { scrollUntilVisible } from '../core/gestures';
import { by } from '../core/locators';
import { createLogger } from '../core/logger';
import { isAndroid } from '../core/platform';
import { BaseScreen } from './BaseScreen';
import { LoginScreen } from './LoginScreen';

const log = createLogger('account');

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
    if (isAndroid()) return this.waitForSignedInAndroid(timeout);
    await waitForDisplayed(by.testId(this.ids.signedInContent), {
      timeout,
      name: 'signed-in Account view',
    });
  }

  /**
   * Android: the same wait, but it keeps going while the sign-in request is
   * visibly still running (the button reads "Sign in, busy"), for at most
   * SIGN_IN_EXTRA_MS more. On 2026-11-24 CI the device answered lookups in
   * 1–3 s, yet the button stayed busy for the whole 60 s after the tap, on
   * both attempts (a green run 1.5 h earlier signed in within 11 s). A request
   * still running is a slow server or network, not a failed sign-in. Once the
   * button stops being busy without the signed-in view appearing, it fails at
   * once with the same message as before.
   */
  private async waitForSignedInAndroid(timeout: number): Promise<void> {
    const SIGN_IN_EXTRA_MS = 120_000;
    const signedIn = by.testId(this.ids.signedInContent);
    if (await appearsWithin(signedIn, timeout)) return;
    const extraUntil = Date.now() + SIGN_IN_EXTRA_MS;
    while (Date.now() < extraUntil && (await LoginScreen.isSubmitBusy())) {
      log.info('The sign-in request is still running ("Sign in, busy"): waiting for it, as a user would');
      if (await appearsWithin(signedIn, env.run.waitTimeout)) return;
    }
    if (await LoginScreen.isSubmitBusy()) {
      throw new Error(
        `Expected "signed-in Account view" to be displayed: the sign-in request did not finish within ` +
          `${Math.round((timeout + SIGN_IN_EXTRA_MS) / 1000)}s (the button still reads "Sign in, busy"). ` +
          'The auth API (POST /api/token) or the device network is slow.',
      );
    }
    throw new Error('Expected "signed-in Account view" to be displayed');
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
