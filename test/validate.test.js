const test = require("node:test");
const assert = require("node:assert/strict");
const { jaccard, nearDuplicatePairs } = require("../scripts/validate.js");

// nearDuplicatePairs replaced an all-pairs loop; it must find exactly the
// same pairs (validate's warnings are compared run to run by humans).
test("nearDuplicatePairs matches a brute-force all-pairs scan", () => {
  let seed = 7;
  const rng = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const vocab = Array.from({ length: 30 }, (_, i) => `w${i}`);
  const sets = Array.from({ length: 400 }, () => {
    const size = Math.floor(rng() * 7); // includes empty sets, which score 1 against each other
    return new Set(Array.from({ length: size }, () => vocab[Math.floor(rng() ** 2 * vocab.length)]));
  });
  for (const threshold of [0.5, 0.7, 0.85]) {
    const expected = [];
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const sim = jaccard(sets[i], sets[j]);
        if (sim >= threshold) expected.push([i, j, sim]);
      }
    }
    assert.ok(expected.length > 50, "fixture should produce plenty of matches");
    assert.deepEqual(nearDuplicatePairs(sets, threshold), expected);
  }
});
