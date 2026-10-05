#!/usr/bin/env node
// Turns a Firebase Realtime Database export of player thumbs-down reports into
// a triage list, grouped by question and sorted by how many people flagged it.
// Read-only: never edits question data. Zero dependencies.
//
// Export from the Firebase console: Realtime Database -> Data -> (three dots)
// -> Export JSON. Either the whole-DB export ({ "feedback": {...} }) or just
// the "feedback" node works.
//
// Usage: npm run feedback-report -- <path-to-rtdb-export.json> [--json]

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("Usage: npm run feedback-report -- <path-to-rtdb-export.json> [--json]");
  process.exit(2);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Same loader shape as the other scripts: question files omit the per-question
// "category", so re-attach it from the containing category.
function loadCorpus() {
  const byId = new Map();
  const categories = loadJson(path.join(DATA_DIR, "categories.json"));
  for (const cat of categories) {
    for (const q of loadJson(path.join(DATA_DIR, cat.file))) byId.set(q.id, { ...q, category: cat.id });
  }
  return byId;
}

function extractReports(exported) {
  const node = exported && exported.feedback && typeof exported.feedback === "object" ? exported.feedback : exported;
  if (!node || typeof node !== "object") return [];
  // RTDB turns arrays with gaps into objects and vice versa, so be lenient
  // about both the node and each report's `options`.
  return Object.values(node).filter((r) => r && typeof r === "object" && typeof r.questionId === "string");
}

function isoDate(report) {
  const ms = typeof report.receivedAt === "number" ? report.receivedAt : report.clientCreatedAt;
  return typeof ms === "number" ? new Date(ms).toISOString() : "unknown date";
}

function group(reports, corpus) {
  const groups = new Map();
  for (const r of reports) {
    if (!groups.has(r.questionId)) groups.set(r.questionId, []);
    groups.get(r.questionId).push(r);
  }
  const out = [];
  for (const [questionId, list] of groups) {
    const current = corpus.get(questionId) || null;
    list.sort((a, b) => (a.receivedAt || a.clientCreatedAt || 0) - (b.receivedAt || b.clientCreatedAt || 0));
    const latest = list[list.length - 1];
    out.push({
      questionId,
      category: current ? current.category : latest.category,
      count: list.length,
      exists: !!current,
      edited: !!current && list.some((r) => r.question !== current.question || r.answer !== current.answer),
      current: current ? { question: current.question, options: current.options, answer: current.answer } : null,
      reports: list.map((r) => ({
        comment: r.comment || "",
        selected: r.selected || "",
        context: r.context,
        date: isoDate(r),
        appBuild: r.appBuild,
        snapshot: { question: r.question, answer: r.answer },
      })),
    });
  }
  out.sort((a, b) => b.count - a.count || a.questionId.localeCompare(b.questionId));
  return out;
}

function printText(groups, total) {
  console.log(`${total} report(s) across ${groups.length} question(s)\n`);
  for (const g of groups) {
    const flags = [];
    if (!g.exists) flags.push("(question no longer exists)");
    else if (g.edited) flags.push("(question edited since report)");
    console.log(`${g.questionId}  [${g.category}]  x${g.count}  ${flags.join(" ")}`.trimEnd());
    if (g.current) {
      console.log(`  Q: ${g.current.question}`);
      console.log(`  A: ${g.current.answer}`);
    } else {
      const snap = g.reports[g.reports.length - 1].snapshot;
      console.log(`  Q (snapshot): ${snap.question}`);
      console.log(`  A (snapshot): ${snap.answer}`);
    }
    for (const r of g.reports) {
      const comment = r.comment ? `"${r.comment.replace(/\s*\n\s*/g, " / ")}"` : "(no comment)";
      console.log(`  - ${comment}`);
      console.log(`    selected: ${r.selected || "(none)"} | ${r.context} | ${r.date} | build ${r.appBuild ?? "?"}`);
    }
    console.log("");
  }
}

function main() {
  let exported;
  try {
    exported = loadJson(path.resolve(file));
  } catch (e) {
    console.error(`Couldn't read ${file}: ${e.message}`);
    process.exit(1);
  }
  const reports = extractReports(exported);
  const groups = group(reports, loadCorpus());
  if (asJson) console.log(JSON.stringify({ total: reports.length, questions: groups }, null, 2));
  else printText(groups, reports.length);
}

main();
