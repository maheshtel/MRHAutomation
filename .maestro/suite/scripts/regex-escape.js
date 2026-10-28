// Regex-escapes a value so it can be matched literally inside a Maestro
// text/id selector (selectors are regexes: "$12.75" must match a literal "$"
// and a literal ".").
//
// Usage (env values are interpolated by Maestro before the script runs):
//   - runScript:
//       file: ../../scripts/regex-escape.js
//       env:
//         VALUE: <text to escape, e.g. output.productName in a dollar-brace>
//         OUT: nameRe              # result is written to output.nameRe
//
// Why a script file: an inline dollar-brace expression in YAML ends at the
// first closing brace, loses every backslash and breaks on "$(" or "$]".
// Maestro also expands dollar-brace pairs inside script files (comments too),
// so this file must never contain a "$" directly followed by "{".
output[OUT] = String(VALUE).replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
