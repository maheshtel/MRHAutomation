/**
 * Cross-platform locator builder.
 *
 * React Native exposes `testID` differently per platform:
 *   Android (UiAutomator2) → the element's `resource-id`
 *   iOS     (XCUITest)     → the element's accessibility identifier (`name`)
 * and `accessibilityLabel` as:
 *   Android → `content-desc`
 *   iOS     → `label`
 *
 * Each helper returns the native selector for the current platform, so page
 * objects describe *what* to find and never branch on the platform themselves.
 *
 * Strategy choice: UiSelector on Android and NSPredicate on iOS are both
 * evaluated on-device, which is much faster and less brittle than XPath.
 *
 * Patterns passed to the `...Matches` helpers are full-match regular
 * expressions on both platforms (Java `Pattern.matches` / ICU `MATCHES`).
 * Never use backslashes in them: UiAutomator2 passes `\\` through unprocessed,
 * so `\d` / `\$` silently fail to match on Android. Use `[0-9]`, `[$]`.
 */
import { isAndroid } from './platform';

export type Selector = string;

/**
 * Escape for a double-quoted argument inside a UiSelector. UiAutomator2's parser
 * handles `\"` but passes other backslashes through untouched, so only quotes
 * are escaped.
 */
const javaString = (value: string): string => value.replace(/"/g, '\\"');

/** Escape for a single-quoted NSPredicate string literal. */
const predicateString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Make arbitrary text literal inside a pattern. Uses character classes (`[.]`)
 * rather than backslashes: UiAutomator2's UiSelector parser does not unescape
 * `\\`, so a backslash escape reaches the regex engine doubled and never
 * matches. Only `]`, `\` and `^` fall back to a backslash.
 */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?$(){}|[]/g, '[$&]').replace(/[\]\\^]/g, '\\$&');

const uiSelector = (body: string): Selector => `android=new UiSelector().${body}`;
const predicate = (body: string): Selector => `-ios predicate string:${body}`;

interface MatchOptions {
  caseInsensitive?: boolean;
}

export const by = {
  /** Exact React Native `testID`. */
  testId(id: string): Selector {
    return isAndroid() ? uiSelector(`resourceId("${javaString(id)}")`) : `~${id}`;
  },

  /** `testID` starting with a prefix, e.g. `home-product-card-`. */
  testIdStartsWith(prefix: string): Selector {
    return isAndroid()
      ? uiSelector(`resourceIdMatches("${javaString(`${escapeRegex(prefix)}.*`)}")`)
      : predicate(`name BEGINSWITH '${predicateString(prefix)}'`);
  },

  /** `testID` matching a full regular expression, e.g. `home-top-banner-[0-9]+`. */
  testIdMatches(pattern: string): Selector {
    return isAndroid()
      ? uiSelector(`resourceIdMatches("${javaString(pattern)}")`)
      : predicate(`name MATCHES '${predicateString(pattern)}'`);
  },

  /** Exact `accessibilityLabel`. */
  label(label: string): Selector {
    return isAndroid()
      ? uiSelector(`description("${javaString(label)}")`)
      : predicate(`label == '${predicateString(label)}'`);
  },

  /** `accessibilityLabel` starting with a prefix (e.g. a label with a live count). */
  labelStartsWith(prefix: string): Selector {
    return isAndroid()
      ? uiSelector(`descriptionStartsWith("${javaString(prefix)}")`)
      : predicate(`label BEGINSWITH '${predicateString(prefix)}'`);
  },

  /** `accessibilityLabel` matching a full regular expression. */
  labelMatches(pattern: string, { caseInsensitive = false }: MatchOptions = {}): Selector {
    return isAndroid()
      ? uiSelector(
          `descriptionMatches("${javaString(caseInsensitive ? `(?i)${pattern}` : pattern)}")`,
        )
      : predicate(`label MATCHES${caseInsensitive ? '[c]' : ''} '${predicateString(pattern)}'`);
  },

  /** Visible text. Use sparingly — copy changes break it; prefer testIDs. */
  text(text: string): Selector {
    return isAndroid()
      ? uiSelector(`text("${javaString(text)}")`)
      : predicate(`label == '${predicateString(text)}' OR value == '${predicateString(text)}'`);
  },
} as const;
