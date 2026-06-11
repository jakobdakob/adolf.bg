#!/usr/bin/env node
/**
 * Build public/quizzes/game.json from the curated bilingual MCQ pool.
 *
 * Reads the three final_quiz_{section}.md files from ~/Downloads/quiz_pools/_final
 * (overridable via QUIZ_SRC_DIR) and produces a single JSON file tailored for
 * the Orthopaedic Kombat game.
 *
 * Differences from public/quizzes/all.json (built by scripts/build_quiz_data.py):
 *   - Adds a `topicTitles` lookup so the in-game meta strip can show a localized
 *     chapter name (factored out instead of repeated per Q — keeps the payload
 *     ~600 KB smaller).
 *   - Pre-shuffles the questions so any naive index-based draw is balanced
 *     across sections / chapters even before the game's own RNG kicks in.
 *   - Skips per-topic files (game.json is the only output).
 *
 * Output shape (single JSON document):
 *   {
 *     meta: { generated: ISO8601, total, perSection: {ortho, trauma, anatomy} },
 *     topicTitles: {
 *       ortho:   { "1": {bg, en}, "2": {bg, en}, ... },
 *       trauma:  { "1": {bg, en}, ... },
 *       anatomy: { "1": {bg, en}, ... }
 *     },
 *     questions: [
 *       { id, section, topic,
 *         bg: {stem, options[4], correct: 0..3},
 *         en: {stem, options[4], correct: 0..3} },
 *       ...
 *     ]
 *   }
 * The game does `topicTitles[q.section][q.topic][lang]` to resolve the label.
 *
 * Usage:
 *   node scripts/build-game-questions.mjs
 *   QUIZ_SRC_DIR=/path/to/_final node scripts/build-game-questions.mjs
 *   npm run build:game-data
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const SECTIONS = ["ortho", "trauma", "anatomy"];
const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3 };

// "## Ortho 1 — <BG title> / <EN title>"
function chapterHeaderRegex(section) {
  const cap = section[0].toUpperCase() + section.slice(1);
  return new RegExp(`^## ${cap} (\\d+) — (.+)$`, "gm");
}

// Single Q block — same regex shape as the Python parser, ported to JS.
const Q_BLOCK_RE = new RegExp(
  "### Q(\\d+)\\s*\\n" +
  "\\*\\*BG:\\*\\*\\s*(.+?)\\n" +
  "-\\s*A\\)\\s*(.+?)\\n" +
  "-\\s*B\\)\\s*(.+?)\\n" +
  "-\\s*C\\)\\s*(.+?)\\n" +
  "-\\s*D\\)\\s*(.+?)\\n" +
  "\\*\\*Correct:\\*\\*\\s*([A-D])\\s*\\n" +
  "\\*\\*EN:\\*\\*\\s*(.+?)\\n" +
  "-\\s*A\\)\\s*(.+?)\\n" +
  "-\\s*B\\)\\s*(.+?)\\n" +
  "-\\s*C\\)\\s*(.+?)\\n" +
  "-\\s*D\\)\\s*(.+?)\\n" +
  "\\*\\*Correct:\\*\\*\\s*([A-D])",
  "gs",
);

/** Split "<bg title> / <en title>" — slash with surrounding spaces is the convention. */
function splitTitle(raw) {
  const idx = raw.indexOf(" / ");
  if (idx === -1) return { bg: raw.trim(), en: raw.trim() };
  return { bg: raw.slice(0, idx).trim(), en: raw.slice(idx + 3).trim() };
}

function parseSection(srcDir, section) {
  const path = join(srcDir, `final_quiz_${section}.md`);
  const text = readFileSync(path, "utf8");

  // First pass: locate every chapter header and its byte span.
  const headers = [];
  const re = chapterHeaderRegex(section);
  let m;
  while ((m = re.exec(text)) !== null) {
    headers.push({
      n: parseInt(m[1], 10),
      title: splitTitle(m[2]),
      bodyStart: m.index + m[0].length,
    });
  }
  if (!headers.length) {
    throw new Error(`no chapter headers matched in ${path}`);
  }

  // Second pass: for each chapter, parse all Q blocks inside its slice.
  const out = [];
  let mismatches = 0;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1].bodyStart - text.slice(headers[i + 1].bodyStart).search(/[\s\S]/) : text.length;
    // Easier: just slice to the next header's bodyStart minus its own header
    // length. We saved bodyStart AFTER the header line, so the simpler bound is
    // the next match's index. Re-derive via regex:
    const nextStart = i + 1 < headers.length
      ? findNextChapterStart(text, h.bodyStart, section)
      : text.length;
    const body = text.slice(h.bodyStart, nextStart);

    const qre = new RegExp(Q_BLOCK_RE.source, Q_BLOCK_RE.flags);
    let qm;
    let countInChapter = 0;
    while ((qm = qre.exec(body)) !== null) {
      const qn = parseInt(qm[1], 10);
      const bgCorrect = LETTER_TO_IDX[qm[7]];
      const enCorrect = LETTER_TO_IDX[qm[13]];
      if (bgCorrect !== enCorrect) {
        mismatches++;
        process.stderr.write(
          `  warn: ${section}-${h.n}-q${qn} BG/EN correct mismatch ` +
          `(${qm[7]} vs ${qm[13]}); using BG.\n`,
        );
      }
      out.push({
        id: `${section}-${h.n}-q${qn}`,
        section,
        topic: h.n,
        bg: {
          stem: qm[2].trim(),
          options: [qm[3].trim(), qm[4].trim(), qm[5].trim(), qm[6].trim()],
          correct: bgCorrect,
        },
        en: {
          stem: qm[8].trim(),
          options: [qm[9].trim(), qm[10].trim(), qm[11].trim(), qm[12].trim()],
          correct: enCorrect,
        },
      });
      countInChapter++;
    }
    if (!countInChapter) {
      throw new Error(`${section} ch${h.n}: 0 questions parsed`);
    }
  }
  // Collect the topic-title lookup for this section.
  const topicTitles = {};
  for (const h of headers) {
    topicTitles[h.n] = { bg: h.title.bg, en: h.title.en };
  }
  return { section, questions: out, mismatches, topicTitles };
}

function findNextChapterStart(text, fromIdx, section) {
  const cap = section[0].toUpperCase() + section.slice(1);
  const re = new RegExp(`^## ${cap} \\d+ — `, "m");
  const slice = text.slice(fromIdx);
  const idx = slice.search(re);
  return idx === -1 ? text.length : fromIdx + idx;
}

/** Deterministic Fisher-Yates shuffle (seed-stable) for reproducible builds. */
function seededShuffle(arr, seed) {
  // mulberry32
  let s = seed >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const srcDir = process.env.QUIZ_SRC_DIR
    ? resolve(process.env.QUIZ_SRC_DIR)
    : join(homedir(), "Downloads", "quiz_pools", "_final");

  // Sanity: make sure the dir exists before parsing.
  try {
    statSync(srcDir);
  } catch (e) {
    throw new Error(`QUIZ_SRC_DIR does not exist: ${srcDir}`);
  }

  const all = [];
  const perSection = {};
  const topicTitles = {};
  let totalMismatches = 0;
  for (const section of SECTIONS) {
    const parsed = parseSection(srcDir, section);
    perSection[section] = parsed.questions.length;
    totalMismatches += parsed.mismatches;
    topicTitles[section] = parsed.topicTitles;
    all.push(...parsed.questions);
  }

  // Pre-shuffle so any naive draw is already mixed across sections+topics.
  // Use a fixed seed so successive builds produce identical files (good for
  // git diffs and CDN caching).
  // Fixed seed ("B0YCHEV" → 0xB07CEF) for reproducible builds & cleaner diffs.
  const shuffled = seededShuffle(all, 0xB07CEF);

  const out = {
    meta: {
      generated: new Date().toISOString(),
      total: shuffled.length,
      perSection,
      mismatches: totalMismatches,
    },
    topicTitles,
    questions: shuffled,
  };

  const outPath = join(REPO_ROOT, "public", "quizzes", "game.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(out) + "\n",
    "utf8",
  );

  const bytes = statSync(outPath).size;
  console.log(`Wrote ${outPath}`);
  console.log(`  total questions: ${out.meta.total}`);
  for (const s of SECTIONS) {
    console.log(`  ${s}: ${perSection[s]}`);
  }
  console.log(`  bytes: ${bytes.toLocaleString()} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  if (totalMismatches) {
    console.log(`  BG/EN correct mismatches: ${totalMismatches} (kept BG)`);
  }
}

main();
