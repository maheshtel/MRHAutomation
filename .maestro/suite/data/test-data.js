// Shared, non-secret test data for the suite.
//
// Load it at the top of a test:
//   - runScript: ../../data/test-data.js
// then reference values as ${output.data.coupons.valid}.
//
// Credentials do NOT belong here — they come from .env.test via run.ps1.

output.data = {
  // Products the cart tests search for, tried in order: the first one found
  // with Add to Cart enabled is used (subflows/product/open-addable-product.yaml),
  // so a removed or out-of-stock product falls through to the next. Use exact
  // product names.
  products: {
    candidates: ['Mango Butter Organic', 'Lip Balm Sticks', 'Carnauba Wax Organic'],
  },
  coupons: {
    valid: 'DESCAMOUNTORDER',
    invalid: 'SampleCoupon',
    // Error shown under the coupon field for an invalid code.
    invalidMessage: 'The applied coupon code is invalid.',
  },
  // Created (and deleted first if left over) by the wishlist test.
  wishlist: {
    name: 'My Wishlist Test',
  },
  // Shop tab: the first 5 entries of each "Shop by" list, in display order.
  shop: {
    categories: [
      'Herbs & Spices',
      'Herbal Tinctures & Capsules',
      'Functional Foods & Beverages',
      'Teas',
      'Culinary Essentials',
    ],
    functions: [
      'Autumn Care',
      'Digestion',
      "Women's Health",
      'Focus & Cognition',
      'Hair & Skin Health',
    ],
  },
};
