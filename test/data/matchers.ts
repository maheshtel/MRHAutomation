/** Search, cart and list surfaces can render the same name with different entity encoding. */
export const normaliseName = (value: string): string =>
  value.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();

/** True when an element label (cart row, list card…) names the given product. */
export const sameProduct = (label: string, productTitle: string): boolean =>
  normaliseName(label).includes(normaliseName(productTitle));
