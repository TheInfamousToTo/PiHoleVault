/**
 * Remove every leading and trailing `ch` from `value`.
 *
 * A loop rather than /^x+|x+$/: that regex backtracks polynomially on long
 * runs of the character, and these strings come from user settings.
 */
function trimChar(value, ch) {
  const s = String(value);
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === ch) start += 1;
  while (end > start && s[end - 1] === ch) end -= 1;
  return s.slice(start, end);
}

function trimEndChar(value, ch) {
  const s = String(value);
  let end = s.length;
  while (end > 0 && s[end - 1] === ch) end -= 1;
  return s.slice(0, end);
}

module.exports = { trimChar, trimEndChar };
