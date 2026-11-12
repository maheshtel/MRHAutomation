/**
 * Feature: Login
 *
 *   Scenario: A customer signs in and sees the full Home page
 *     Given I am a guest on the Account page
 *     When I open the Sign In screen
 *     And I sign in with valid customer credentials
 *     Then my Account page shows my email address
 *     When I open the Home tab
 *     Then the Home page shows every key section
 */
import { addArgument, addFeature, addSeverity } from '@wdio/allure-reporter';
import { expect } from '@wdio/globals';
import { And, Given, Then, When } from '../../src/core/bdd';
import { AuthFlow } from '../../src/flows/auth.flow';
import { AccountScreen } from '../../src/screens/AccountScreen';
import { HOME_SECTIONS, HomeScreen } from '../../src/screens/HomeScreen';
import { LoginScreen } from '../../src/screens/LoginScreen';
import { TabBar } from '../../src/screens/TabBar';
import { OPTIONAL_HOME_SECTIONS, REQUIRED_HOME_SECTIONS } from '../data/catalog';
import { users } from '../data/users';

const sectionNames = (keys: readonly (keyof typeof HOME_SECTIONS)[]) =>
  keys.map((key) => HOME_SECTIONS[key].name);

describe('Feature: Login @smoke', () => {
  after(async () => {
    await AuthFlow.signOutQuietly();
  });

  it('Scenario: A customer signs in and sees the full Home page', async () => {
    await addFeature('Login');
    await addSeverity('blocker');
    const customer = users.customer;

    await Given('I am a guest on the Account page', async () => {
      await AuthFlow.ensureSignedOut();
      expect(await AccountScreen.state()).toBe('guest');
    });

    await When('I open the Sign In screen', async () => {
      await AccountScreen.openSignIn();
      await LoginScreen.waitForLoaded();
    });

    await And('I sign in with valid customer credentials', async () => {
      await LoginScreen.enterCredentials(customer.email, customer.password);
      await LoginScreen.submit();
    });

    await Then('my Account page shows my email address', async () => {
      await AccountScreen.waitForSignedIn();
      expect(await LoginScreen.isLoaded()).toBe(false);
      expect((await AccountScreen.accountSummary()).toLowerCase()).toContain(
        customer.email.toLowerCase(),
      );
    });

    await When('I open the Home tab', async () => {
      await TabBar.open('Home');
      await HomeScreen.waitForContent();
    });

    await Then(
      `the Home page shows every key section (${sectionNames(REQUIRED_HOME_SECTIONS).join(', ')})`,
      async () => {
        const seen = await HomeScreen.findSections(REQUIRED_HOME_SECTIONS);
        const optional = OPTIONAL_HOME_SECTIONS.filter((key) => seen.has(key));
        await addArgument('Optional sections shown', sectionNames(optional).join(', ') || 'none');
        const missing = REQUIRED_HOME_SECTIONS.filter((key) => !seen.has(key));
        expect(sectionNames(missing)).toEqual([]);
      },
    );
  });
});
