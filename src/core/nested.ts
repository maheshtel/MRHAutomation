/**
 * Tapping a control that lives inside an `accessible` React Native container.
 *
 * On iOS an element with `accessible={true}` is a leaf in the accessibility
 * tree, so XCUITest cannot see anything inside it — e.g. the delete button in a
 * cart row, or the "+" on a product card. Android exposes those children
 * normally.
 *
 * `tapNested` therefore:
 *   1. taps the child by its testID when the platform exposes it (Android), and
 *   2. on iOS, taps the child's position, given as an offset from the
 *      container's edges in points (iOS points == React Native dp).
 * On Android a child that cannot be found is off screen, so it throws rather
 * than guess. Either way the container must be fully on screen first: an offset
 * from a clipped container lands in the wrong place.
 *
 * The offsets are not guesses: whenever the child IS reachable, its real offset
 * is measured and logged at debug level (`E2E_LOG_LEVEL=debug`), so the iOS
 * values can be re-measured on Android after any layout change.
 */
import { $, driver } from '@wdio/globals';
import { tapAt } from './gestures';
import { createLogger } from './logger';
import { by } from './locators';
import { isAndroid } from './platform';

const log = createLogger('nested');

/** Where the child's centre sits, measured from the container's edges, in points. */
export interface EdgeOffset {
  fromLeft?: number;
  fromRight?: number;
  fromTop?: number;
  fromBottom?: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function rectOf(element: WebdriverIO.Element): Promise<Rect> {
  const { x, y } = await element.getLocation();
  const { width, height } = await element.getSize();
  return { x, y, width, height };
}

/** Device pixels per point: Android reports px, iOS already reports points. */
async function pixelsPerPoint(): Promise<number> {
  if (!isAndroid()) return 1;
  try {
    const dpi = Number(await driver.getDisplayDensity());
    return dpi > 0 ? dpi / 160 : 1;
  } catch {
    return 1;
  }
}

function pointFromOffset(container: Rect, offset: EdgeOffset, scale: number) {
  const x =
    offset.fromLeft !== undefined
      ? container.x + offset.fromLeft * scale
      : container.x + container.width - (offset.fromRight ?? 0) * scale;
  const y =
    offset.fromTop !== undefined
      ? container.y + offset.fromTop * scale
      : container.y + container.height - (offset.fromBottom ?? 0) * scale;
  return { x, y };
}

export async function tapNested(
  container: WebdriverIO.Element,
  childTestId: string,
  fallback: EdgeOffset,
  name: string,
): Promise<void> {
  const child = $(by.testId(childTestId));

  if (await child.isDisplayed().catch(() => false)) {
    // Record the real geometry so the iOS fallback can be kept accurate.
    const scale = await pixelsPerPoint();
    const parent = await rectOf(container);
    const own = await rectOf(await child.getElement());
    const cx = own.x + own.width / 2;
    const cy = own.y + own.height / 2;
    log.debug(`measured offset for ${name} (points)`, {
      fromLeft: Math.round((cx - parent.x) / scale),
      fromRight: Math.round((parent.x + parent.width - cx) / scale),
      fromTop: Math.round((cy - parent.y) / scale),
      fromBottom: Math.round((parent.y + parent.height - cy) / scale),
    });
    await child.click();
    return;
  }

  // Android exposes nested children, so a missing child here is off screen (or
  // the container is clipped by a scrolled list), not hidden by the platform.
  // An offset from a clipped container's rect lands on the wrong spot, and the
  // tap "succeeds" without doing anything. Fail with the real reason instead.
  if (isAndroid()) {
    throw new Error(
      `"${childTestId}" (${name}) is not on screen; scroll its container fully into view first`,
    );
  }

  const scale = await pixelsPerPoint();
  const point = pointFromOffset(await rectOf(container), fallback, scale);
  log.warn(`"${childTestId}" is not exposed on this platform; tapping ${name} by position`, point);
  await tapAt(point);
}
