// Builds a regex that matches VALUE literally, or VALUE with any ONE character
// missing, for cleaning up test data whose name was typed incompletely.
//
// Usage (env values are interpolated by Maestro before the script runs):
//   - runScript:
//       file: ../../scripts/name-variants-re.js
//       env:
//         VALUE: <name, e.g. output.data.wishlist.name in a dollar-brace>
//         OUT: wishlistLeftoverRe       # result is written to output.wishlistLeftoverRe
//
// Why: on a slow Android emulator inputText dropped characters, and the account
// was left with lists named "M Wishlist Test" and "My ishlist Test" (run
// 20261111-071052). The leftover cleanup matches those too, so they are deleted
// instead of piling up. (type-text.yaml now checks typed text, so new ones
// shouldn't appear.)
//
// Maestro also expands dollar-brace pairs inside script files (comments too),
// so this file must never contain a "$" directly followed by "{".
var value = String(VALUE);
function escapeRe(text) {
  return text.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
}
var alternatives = [escapeRe(value)];
for (var i = 0; i < value.length; i++) {
  var variant = escapeRe(value.slice(0, i) + value.slice(i + 1));
  if (alternatives.indexOf(variant) < 0) alternatives.push(variant);
}
output[OUT] = '(?:' + alternatives.join('|') + ')';
