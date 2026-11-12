/**
 * Sign-in screen (src/screens/LoginScreen.tsx).
 *
 * DSInput puts the testID on the TextInput itself and renders the field error
 * in `<testID>-subtext`.
 */
import { $ } from '@wdio/globals';
import { hideKeyboard, isVisible, tap, typeText } from '../core/elements';
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
    await typeText(by.testId(this.ids.password), password, { name: 'Password field' });
    await hideKeyboard();
  }

  async submit(): Promise<void> {
    await tap(by.testId(this.ids.submit), { name: 'Sign in button' });
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
