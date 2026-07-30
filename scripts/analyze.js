#!/usr/bin/env node
// Reports on the existing question bank so it's obvious where to focus when
// writing more questions: difficulty balance, correct-answer position bias
// (are we accidentally always putting the right answer in slot A?), subject
// coverage (which characters/topics are thin), and the next free id per
// category. Read-only — never edits question data. Zero dependencies.
//
// Usage: node scripts/analyze.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const TOPICS_FILE = path.join(DATA_DIR, "topics.json");

const DIFFICULTIES = ["easy", "medium", "hard"];
const THIN_TOPIC_COUNT = 3; // topics at or below this count get called out
const POSITION_BIAS_THRESHOLD = 0.35; // flag a slot if it holds the answer more than this often

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pct(n, total) {
  return total === 0 ? "0%" : `${((n / total) * 100).toFixed(0)}%`;
}

function bar(n, total, width = 20) {
  if (total === 0) return "";
  const filled = Math.round((n / total) * width);
  return "#".repeat(filled) + "-".repeat(width - filled);
}

function nextId(questions, categoryId) {
  let max = 0;
  for (const q of questions) {
    const m = typeof q.id === "string" && q.id.match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const width = String(max + 1).length < 3 ? 3 : String(max + 1).length;
  return `${categoryId}-${String(max + 1).padStart(width, "0")}`;
}

function analyzeDifficulty(questions) {
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions) {
    if (counts[q.difficulty] !== undefined) counts[q.difficulty]++;
  }
  return counts;
}

function analyzeAnswerPosition(questions) {
  const counts = [0, 0, 0, 0];
  let scored = 0;
  for (const q of questions) {
    if (!Array.isArray(q.options)) continue;
    const idx = q.options.indexOf(q.answer);
    if (idx === -1) continue;
    counts[idx] = (counts[idx] || 0) + 1;
    scored++;
  }
  return { counts, scored };
}

function analyzeTopics(questions, topics) {
  const results = topics.map((t) => ({ name: t.name, count: 0 }));
  const patterns = topics.map((t) =>
    t.aliases.map((a) => new RegExp(`\\b${escapeRegExp(a)}\\b`, "i"))
  );

  let unmatched = 0;
  for (const q of questions) {
    const haystack = [q.question, ...(q.options || [])].join(" | ");
    let hit = false;
    topics.forEach((t, i) => {
      if (patterns[i].some((re) => re.test(haystack))) {
        results[i].count++;
        hit = true;
      }
    });
    if (!hit) unmatched++;
  }
  return { results: results.sort((a, b) => a.count - b.count), unmatched };
}

function printCategoryReport(cat, questions, topicList) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${cat.name}  (${questions.length} questions)`);
  console.log("=".repeat(60));

  // Difficulty balance
  const diff = analyzeDifficulty(questions);
  console.log("\nDifficulty balance:");
  for (const d of DIFFICULTIES) {
    const n = diff[d];
    console.log(`  ${d.padEnd(7)} ${String(n).padStart(3)}  ${pct(n, questions.length).padStart(4)}  ${bar(n, questions.length)}`);
  }
  const lowestDiff = DIFFICULTIES.reduce((a, b) => (diff[a] <= diff[b] ? a : b));

  // Answer position bias
  const pos = analyzeAnswerPosition(questions);
  console.log("\nCorrect-answer position (should be roughly even across A/B/C/D):");
  const labels = ["A", "B", "C", "D"];
  let biasedSlot = null;
  pos.counts.forEach((n, i) => {
    const ratio = pos.scored === 0 ? 0 : n / pos.scored;
    const flag = ratio > POSITION_BIAS_THRESHOLD ? "  <- overused" : "";
    if (ratio > POSITION_BIAS_THRESHOLD) biasedSlot = labels[i];
    console.log(`  ${labels[i]}  ${String(n).padStart(3)}  ${pct(n, pos.scored).padStart(4)}  ${bar(n, pos.scored)}${flag}`);
  });

  // Topic coverage
  if (topicList && topicList.length) {
    const { results, unmatched } = analyzeTopics(questions, topicList);
    console.log("\nSubject coverage (lowest first):");
    for (const r of results) {
      const flag = r.count <= THIN_TOPIC_COUNT ? "  <- thin" : "";
      console.log(`  ${String(r.count).padStart(3)}  ${r.name}${flag}`);
    }
    if (unmatched > 0) {
      console.log(`\n  ${unmatched} question(s) didn't match any tracked subject (fine, but consider adding a topic to data/topics.json if a pattern emerges).`);
    }

    const thin = results.filter((r) => r.count <= THIN_TOPIC_COUNT).map((r) => r.name);
    console.log("\nSuggested focus for new questions:");
    if (thin.length) {
      console.log(`  - Subjects: ${thin.join(", ")}`);
    } else {
      console.log("  - Subject coverage looks reasonably even.");
    }
    console.log(`  - Difficulty: could use more "${lowestDiff}" questions (currently the smallest bucket).`);
    if (biasedSlot) {
      console.log(`  - Answer key: slot ${biasedSlot} holds the correct answer more than ${(POSITION_BIAS_THRESHOLD * 100).toFixed(0)}% of the time — vary correct-answer placement in new questions.`);
    }
  } else {
    console.log(`\n(No topic list configured for "${cat.id}" in data/topics.json — skipping subject coverage.)`);
  }

  console.log(`\nNext free id: ${nextId(questions, cat.id)}`);
}

function main() {
  const categories = loadJson(CATEGORIES_FILE);
  const topicsByCategory = fs.existsSync(TOPICS_FILE) ? loadJson(TOPICS_FILE) : {};

  let grandTotal = 0;
  for (const cat of categories) {
    const filePath = path.join(DATA_DIR, cat.file);
    const questions = loadJson(filePath);
    grandTotal += questions.length;
    printCategoryReport(cat, questions, topicsByCategory[cat.id]);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total questions across all categories: ${grandTotal}`);
  console.log("=".repeat(60));
}

main();
