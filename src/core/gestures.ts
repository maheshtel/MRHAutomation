/**
 * Touch gestures built on W3C actions, so the same code drives UiAutomator2 and
 * XCUITest. Coordinates are computed from the window size rather than from a
 * scroll container, because the app nests horizontal carousels inside its
 * vertical screens and "the first ScrollView" is frequently the wrong one.
 */
import { driver } from '@wdio/globals';
import { firstVisible } from './elements';
import { createLogger } from './logger';
import type { Selector } from './locators';

const log = createLogger('gestures');

export type Direction = 'up' | 'down';

interface Point {
  x: number;
  y: number;
}

/**
 * The floating bottom tab bar overlays the lower part of every screen. Content
 * under it is "visible" to the automation tree but a tap lands on the tab bar.
 * Swipes and taps stay above this fraction of the screen height.
 */
const SAFE_BOTTOM = 0.78;
const SAFE_TOP = 0.18;

async function windowSize() {
  return driver.getWindowSize();
}

export async function swipe(from: Point, to: Point, durationMs = 450): Promise<void> {
  await driver
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ x: Math.round(from.x), y: Math.round(from.y) })
    .down()
    .pause(80)
    .move({ x: Math.round(to.x), y: Math.round(to.y), duration: durationMs })
    .pause(80)
    .up()
    .perform();
  await driver.releaseActions().catch(() => undefined);
}

export async function tapAt(point: Point): Promise<void> {
  await driver
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ x: Math.round(point.x), y: Math.round(point.y) })
    .down()
    .pause(60)
    .up()
    .perform();
  await driver.releaseActions().catch(() => undefined);
}

/**
 * Scroll the screen content. `down` reveals content further down the page
 * (finger moves up). `distance` is a fraction of the screen height.
 */
export async function scroll(direction: Direction, distance = 0.45): Promise<void> {
  const { width, height } = await windowSize();
  const x = width / 2;
  const span = height * distance;
  const start = direction === 'down' ? height * SAFE_BOTTOM - 10 : height * SAFE_TOP + 10;
  const end = direction === 'down' ? start - span : start + span;
  await swipe({ x, y: start }, { x, y: end });
}

export interface ScrollOptions {
  direction?: Direction;
  maxSwipes?: number;
  name?: string;
  /**
   * Lowest point (fraction of screen height) where a tap is safe. Defaults to
   * just above the tab bar; screens with more pinned UI at the bottom (the
   * cart's floating order summary) pass a smaller value.
   */
  safeBottom?: number;
}

/**
 * Scroll until the element is visible AND clear of the bottom overlays.
 * Throws with the selector name if it never appears.
 */
export async function scrollUntilVisible(
  selector: Selector,
  { direction = 'down', maxSwipes = 10, name, safeBottom = SAFE_BOTTOM }: ScrollOptions = {},
): Promise<WebdriverIO.Element> {
  for (let attempt = 0; attempt <= maxSwipes; attempt += 1) {
    const element = await firstVisible(selector);
    if (element) {
      await bringAboveTabBar(element, safeBottom);
      return element;
    }
    if (attempt < maxSwipes) await scroll(direction);
  }
  throw new Error(`"${name ?? selector}" was not found after ${maxSwipes} swipe(s) ${direction}`);
}

/** If the element's centre sits under the bottom overlays, nudge the page up a little. */
export async function bringAboveTabBar(
  element: WebdriverIO.Element,
  safeBottom = SAFE_BOTTOM,
): Promise<void> {
  const { height } = await windowSize();
  for (let i = 0; i < 3; i += 1) {
    const { y } = await element.getLocation();
    const { height: h } = await element.getSize();
    const centre = y + h / 2;
    if (centre <= height * safeBottom) return;
    log.debug('element under bottom overlay, nudging', { centre, limit: height * safeBottom });
    await scroll('down', 0.2);
  }
}

/** Scroll back to the top of the current screen. */
export async function scrollToTop(swipes = 4): Promise<void> {
  for (let i = 0; i < swipes; i += 1) await scroll('up', 0.6);
}
