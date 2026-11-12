import { env } from '../../config/env';
import type { HomeSectionKey } from '../../src/screens/HomeScreen';

export const catalog = {
  /** Must return at least one in-stock product in the search typeahead. */
  searchTerm: env.testData.searchTerm,
  /** A code the store will never accept. */
  invalidCouponCode: env.testData.invalidCouponCode,
  /** Message the cart shows for a rejected code (hooks/useAddToCart.ts). */
  invalidCouponMessage: /invalid/i,
};

/**
 * Every list the suite creates starts with this prefix, so leftovers from an
 * interrupted run can be found and deleted without touching real lists.
 */
export const WISHLIST_PREFIX = 'E2E List';

/** A unique list name per run, e.g. "E2E List m3x9k2". */
export const newWishlistName = (): string => `${WISHLIST_PREFIX} ${Date.now().toString(36)}`;

/**
 * Home sections the login scenario requires. These are present in every
 * published Home layout; the rest are CMS- or history-dependent (e.g.
 * "Purchase again" only exists for customers with orders) and are reported
 * but not asserted.
 */
export const REQUIRED_HOME_SECTIONS: HomeSectionKey[] = [
  'topBanner',
  'heroSearch',
  'categories',
  'productShelf',
  'brandFooter',
];

export const OPTIONAL_HOME_SECTIONS: HomeSectionKey[] = [
  'announcementBanner',
  'imageBanner',
  'whatsNew',
  'subCategories',
  'recentlyViewed',
  'purchaseAgain',
];
