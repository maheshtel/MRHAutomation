/**
 * Sign-in screen (src/screens/LoginScreen.tsx).
 *
 * DSInput puts the testID on the TextInput itself and renders the field error
 * in `<testID>-subtext`.
 */
import { $, $$ } from '@wdio/globals';
import { getLabel, isVisible, typeText } from '../core/elements';
import { tapPastKeyboard } from '../core/keyboard';
import { by } from '../core/locators';
import { BaseScreen } from './BaseScreen';

class LoginScreenObject extends BaseScreen {
  protected readonly screenName = 'Sign In';

  private readonly ids = {
    email: 'email-input',
    password: 'password-input',
    submit: 'sign-in-button',
    emailError: 'email-input-subtext',
    passwordError: 'password-input-subtext',
  };

  protected root() {
    return by.testId('login-screen');
  }

  async enterCredentials(email: string, password: string): Promise<void> {
    await typeText(by.testId(this.ids.email), email, { name: 'Email field' });
    await typeText(by.testId(this.ids.password), password, { name: 'Password field', mask: true });
  }

  /**
   * Tap SIGN IN with the keyboard still open — never via the keyboard's Done
   * key, which on the password field signs in by itself (see core/keyboard).
   */
  async submit(): Promise<void> {
    await tapPastKeyboard(by.testId(this.ids.submit), {
      name: 'Sign in button',
      returnKey: 'done', // password field: returnKeyType="done" runs handleLogin
    });
  }

  /**
   * Is the sign-in request still in flight? While it runs, the button's label
   * reads "Sign in, busy" and it shows a spinner (sign-in-button-spinner).
   */
  async isSubmitBusy(): Promise<boolean> {
    const [button] = await $$(by.testId(this.ids.submit)).getElements();
    if (!button?.elementId) return false;
    const label = await getLabel(button).catch(() => '');
    return /\bbusy\b/i.test(label);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.waitForLoaded();
    await this.enterCredentials(email, password);
    await this.submit();
  }

  /** Inline validation / credential error under the email field, if any. */
  async emailError(): Promise<string | undefined> {
    const selector = by.testId(this.ids.emailError);
    return (await isVisible(selector)) ? $(selector).getText() : undefined;
  }

  async passwordError(): Promise<string | undefined> {
    const selector = by.testId(this.ids.passwordError);
    return (await isVisible(selector)) ? $(selector).getText() : undefined;
  }
}

export const LoginScreen = new LoginScreenObject();
