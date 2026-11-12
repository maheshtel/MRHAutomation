/**
 * Feature: Logout
 *
 *   Scenario: A signed-in customer signs out
 *     Given I am signed in as a customer
 *     When I tap Sign Out on the Account page
 *     Then the Account page shows the guest view with a Sign In button
 *     And my account details are no longer shown
 *     And I am still signed out after restarting the app
 */
import { addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { App } from '../../src/core/app';
import { And, Given, Then, When } from '../../src/core/bdd';
import { AuthFlow } from '../../src/flows/auth.flow';
import { AccountScreen } from '../../src/screens/AccountScreen';
import { TabBar } from '../../src/screens/TabBar';
import { users } from '../data/users';

describe('Feature: Logout @smoke', () => {
  it('Scenario: A signed-in customer signs out', async () => {
    await addFeature('Logout');
    await addSeverity('critical');

    await Given('I am signed in as a customer', async () => {
      await AuthFlow.ensureSignedIn(users.customer);
    });

    await When('I tap Sign Out on the Account page', async () => {
      await AccountScreen.tapSignOut();
    });

    await Then('the Account page shows the guest view with a Sign In button', async () => {
      await AccountScreen.waitForGuest();
      expect(await AccountScreen.isSignInButtonVisible()).toBe(true);
    });

    await And('my account details are no longer shown', async () => {
      expect(await AccountScreen.isSignedInContentVisible()).toBe(false);
    });

    await And('I am still signed out after restarting the app', async () => {
      await App.restart();
      await TabBar.open('Account');
      expect(await AccountScreen.state()).toBe('guest');
    });
  });
});
