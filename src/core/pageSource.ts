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

  for (const tag of source.match(/<[A-Za-z][^>]*>/g) ?? []) {
    const testId = attribute(tag, idAttr);
    if (!testId || !pattern.test(testId)) continue;
    // Android only lists on-screen nodes; iOS lists everything and flags it.
    if (!isAndroid() && attribute(tag, 'visible') === 'false') continue;
    nodes.push({ testId, label: attribute(tag, labelAttr) ?? '' });
  }
  return nodes;
}
