import { isVisible, waitForDisplayed } from '../core/elements';
import type { Selector } from '../core/locators';

/**
 * A screen is identified by one root element that is present exactly when the
 * screen is on top. Subclasses expose intent-level methods (signIn, addToCart)
 * and keep selectors private, so specs read as user journeys.
 */
export abstract class BaseScreen {
  /** Human-readable screen name for logs and timeout messages. */
  protected abstract readonly screenName: string;

  /** Selector for the element that proves this screen is showing. */
  protected abstract root(): Selector;

  async waitForLoaded(timeout?: number): Promise<this> {
    await waitForDisplayed(this.root(), { timeout, name: `${this.screenName} screen` });
    return this;
  }

  async isLoaded(): Promise<boolean> {
    return isVisible(this.root());
  }
}
