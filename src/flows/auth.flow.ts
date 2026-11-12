/**
 * Authentication journeys composed from screen objects, for reuse as test
 * setup ("given a signed-in user") without repeating the UI steps per spec.
 */
import type { User } from '../../test/data/users';
import { createLogger } from '../core/logger';
import { AccountScreen } from '../screens/AccountScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { TabBar } from '../screens/TabBar';

const log = createLogger('auth');

export const AuthFlow = {
  /** Sign in from anywhere in the app. Leaves the user on the Account tab. */
  async signIn(user: User): Promise<void> {
    await TabBar.open('Account');
    if ((await AccountScreen.state()) === 'signedIn') {
      log.info('Already signed in — signing out first for a clean sign-in');
      await AccountScreen.signOut();
    }
    await AccountScreen.openSignIn();
    await LoginScreen.signIn(user.email, user.password);
    await AccountScreen.waitForSignedIn();
  },

  /**
   * Ensure a signed-in session, signing in only when needed. Retry-safe: a
   * retried test that already got past sign-in keeps its session.
   */
  async ensureSignedIn(user: User): Promise<void> {
    await TabBar.open('Account');
    if ((await AccountScreen.state()) === 'signedIn') return;
    await AccountScreen.openSignIn();
    await LoginScreen.signIn(user.email, user.password);
    await AccountScreen.waitForSignedIn();
  },

  /** Ensure the guest state. No-op when nobody is signed in. */
  async ensureSignedOut(): Promise<void> {
    await TabBar.open('Account');
    if ((await AccountScreen.state()) === 'signedIn') await AccountScreen.signOut();
  },

  /** Best-effort teardown: never masks the real test result. */
  async signOutQuietly(): Promise<void> {
    try {
      await AuthFlow.ensureSignedOut();
    } catch (error) {
      log.warn('Sign-out during teardown failed', error);
    }
  },
};
