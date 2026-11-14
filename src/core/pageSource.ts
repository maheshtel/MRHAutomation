/**
 * Read many elements in ONE round-trip by parsing the page source.
 *
 * Querying N elements one by one costs ~3N device calls (find, isDisplayed,
 * getAttribute…); for long virtualised lists that dominates a test's run time.
 * The page source returns the whole on-screen tree in a single call, which is
 * then filtered locally. Use it for read-only scans; interact with the element
 * afterwards through its testID.
 */
import { driver } from '@wdio/globals';
import { isAndroid } from './platform';

export interface SourceNode {
  /** React Native testID (Android resource-id, iOS name). */
  testId: string;
  /** Accessibility label (Android content-desc, iOS label). */
  label: string;
}

const decode = (value: string): string =>
  value
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const attribute = (tag: string, name: string): string | undefined => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decode(match[1]) : undefined;
};

/** All on-screen nodes whose testID matches `pattern` (a JS RegExp, full match). */
export async function nodesWithTestId(pattern: RegExp): Promise<SourceNode[]> {
  const source = await driver.getPageSource();
  const idAttr = isAndroid() ? 'resource-id' : 'name';
  const labelAttr = isAndroid() ? 'content-desc' : 'label';
  const nodes: SourceNode[] = [];
  const tags = source.match(/<[A-Za-z][^>]*>/g) ?? [];
  const screen = isAndroid() ? undefined : appFrame(tags);

  for (const tag of tags) {
    const testId = attribute(tag, idAttr);
    if (!testId || !pattern.test(testId)) continue;
    // Android only lists on-screen nodes; iOS lists everything and flags it.
    if (screen && !onScreenIos(tag, screen)) continue;
    nodes.push({ testId, label: attribute(tag, labelAttr) ?? '' });
  }
  return nodes;
}

interface Frame {
  width: number;
  height: number;
}

const num = (tag: string, name: string) => Number(attribute(tag, name) ?? NaN);

/** Window size from the root XCUIElementTypeApplication node. */
function appFrame(tags: string[]): Frame {
  const app = tags.find((t) => t.startsWith('<XCUIElementTypeApplication'));
  return app
    ? { width: num(app, 'width'), height: num(app, 'height') }
    : { width: Infinity, height: Infinity };
}

/**
 * Same rule as `isShown` in elements.ts: trust `visible`, except for plain
 * layout containers (XCUIElementTypeOther), which XCUITest marks
 * visible="false" even on screen — for those, a frame overlapping the window.
 */
function onScreenIos(tag: string, screen: Frame): boolean {
  if (attribute(tag, 'visible') !== 'false') return true;
  if (attribute(tag, 'type') !== 'XCUIElementTypeOther') return false;
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((n) => num(tag, n));
  return w > 0 && h > 0 && x < screen.width && y < screen.height && x + w > 0 && y + h > 0;
}
