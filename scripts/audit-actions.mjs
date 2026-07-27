#!/usr/bin/env node
/**
 * Cross-check every backend call the app makes against the Apps Script that
 * has to answer it.
 *
 * Two bugs in one week came from nothing checking this:
 *   - the Confirm Day item pills posted action=removeItem, which had never
 *     been written. The screen got "unknown action", rolled back its
 *     optimistic removal, and the pill reappeared.
 *   - the Admin screen posted {team} where the backend reads {teams:[...]}.
 *     The key was ignored, every mapping silently defaulted to Alpha, and no
 *     team button ever showed as selected.
 *
 * Neither surfaced as an error anywhere. Both are the same shape: the two
 * sides disagree and only the user finds out.
 *
 * Usage, with Code.js pulled by clasp (it is not in this repo):
 *   node scripts/audit-actions.mjs --code /home/info/appsscript/Code.js
 *
 * Exits non-zero if anything is found, so it can gate a deploy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const codeArg = process.argv.indexOf("--code");
const CODE_PATH = codeArg > -1 ? process.argv[codeArg + 1] : null;
const SRC = "src";
if (!CODE_PATH) {
  console.error("usage: node scripts/audit-actions.mjs --code <path to Code.js>");
  process.exit(2);
}
const code = readFileSync(CODE_PATH, "utf8");

/**
 * Keys the backend knowingly does not read. Each needs a reason - an empty
 * excuse here is how a real mismatch gets waved through.
 */
const ALLOWED_UNREAD = {
  // Quo cannot send outbound MMS, so a Quo reply drops attachments by nature.
  // Tracked separately: the UI should not offer them rather than discard them.
  "replyQuo.attachments": "Quo has no outbound MMS",
};

// ---------------------------------------------------------------- backend
// Split on block openings only. A condition may name several actions
// (textClient/textEta share one), and splitting on every occurrence would cut
// a handler off at its own condition and make it look like it reads nothing.
const blockRe = /(?:\}\s*else\s+if|\bif)\s*\(\s*data\.action\s*===\s*'([A-Za-z0-9_]+)'/g;
const starts = [];
for (let m; (m = blockRe.exec(code)); ) starts.push({ at: m.index, name: m[1] });

const handlers = new Map(); // action -> Set(keys it reads), or null = opaque
for (let i = 0; i < starts.length; i++) {
  const body = code.slice(starts[i].at, starts[i + 1]?.at ?? code.length);
  const keys = new Set([...body.matchAll(/data\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  keys.delete("action");
  // Some handlers hand the whole payload to a helper (receiptHtml_(data)), so
  // the keys are read one level down. Counting only `data.x` here would report
  // every one of them as ignored.
  if (/[A-Za-z0-9_]+_\(\s*data\s*[,)]/.test(body)) keys.add("*");
  // Aliases: every action named in this block's condition shares its body.
  const cond = body.slice(0, body.indexOf("{") + 1);
  const names = [...cond.matchAll(/data\.action\s*===\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  for (const n of names.length ? names : [starts[i].name]) handlers.set(n, keys);
}
const getActions = new Set(
  [...code.matchAll(/(?<!data\.)\baction\s*===\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]),
);
// doGet falls back to this when no action is supplied.
const getDefault = code.match(/e\.parameter\.action\)\s*\|\|\s*'([A-Za-z0-9_]+)'/);
if (getDefault) getActions.add(getDefault[1]);

// --------------------------------------------------------------- frontend
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Top-level keys of the object literal enclosing `idx`. Depth 1 only, so an
 *  items:[{name,qty}] payload does not look like it sends name and qty. */
function topLevelKeys(text, idx) {
  let s = text.lastIndexOf("{", idx);
  if (s < 0) return { keys: new Set(), end: idx };
  let depth = 0,
    e = s;
  for (; e < text.length; e++) {
    const c = text[e];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = text.slice(s, e + 1);
  const keys = new Set();
  let d = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "[") d++;
    else if (c === "}" || c === "]") d--;
    else if (d === 1) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(body.slice(i));
      if (m && /[{,]\s*$/.test(body.slice(0, i))) {
        keys.add(m[1]);
        i += m[0].length - 1;
      }
    }
  }
  keys.delete("action");
  return { keys, end: e };
}

const posts = new Map(); // action -> {files:Set, keys:Set}
const gets = new Map();
for (const file of walk(SRC)) {
  const t = readFileSync(file, "utf8");
  const rel = relative(SRC, file);
  for (const m of t.matchAll(/\?action=([A-Za-z0-9_]+)/g)) {
    if (!gets.has(m[1])) gets.set(m[1], new Set());
    gets.get(m[1]).add(rel);
  }
  for (const m of t.matchAll(/action:\s*["']([A-Za-z0-9_]+)["']/g)) {
    // `action: "send" | "save"` is a TypeScript union, not a payload.
    if (/^\s*\|/.test(t.slice(m.index + m[0].length))) continue;
    const { keys } = topLevelKeys(t, m.index);
    if (!posts.has(m[1])) posts.set(m[1], { files: new Set(), keys: new Set() });
    const rec = posts.get(m[1]);
    rec.files.add(rel);
    for (const k of keys) rec.keys.add(k);
  }
}

// ----------------------------------------------------------------- report
let problems = 0;
const say = (s) => console.log(s);

say("POSTS WITH NO HANDLER");
for (const [a, rec] of [...posts].sort()) {
  if (!handlers.has(a)) {
    problems++;
    say(`  !! ${a}  <- ${[...rec.files].join(", ")}`);
  }
}
say("  (none)".padStart(0) === "" ? "" : problems ? "" : "  none");

say("\nGETS WITH NO HANDLER");
let g = 0;
for (const [a, files] of [...gets].sort()) {
  if (!getActions.has(a) && !handlers.has(a)) {
    problems++;
    g++;
    say(`  !! ${a}  <- ${[...files].join(", ")}`);
  }
}
if (!g) say("  none");

say("\nKEYS SENT BUT NEVER READ");
let k = 0;
for (const [a, rec] of [...posts].sort()) {
  const reads = handlers.get(a);
  if (!reads || reads.has("*")) continue;
  const unread = [...rec.keys].filter(
    (x) => !reads.has(x) && !ALLOWED_UNREAD[`${a}.${x}`],
  );
  if (unread.length) {
    problems++;
    k++;
    say(`  !! ${a} ignores: ${unread.join(", ")}  <- ${[...rec.files].join(", ")}`);
  }
}
if (!k) say("  none");

say("\nHANDLERS THE APP NEVER CALLS (informational only)");
const unused = [...handlers.keys()].filter((a) => !posts.has(a)).sort();
say("  " + (unused.join(", ") || "none"));

say(`\n${problems ? `${problems} problem(s) found` : "clean"}`);
process.exit(problems ? 1 : 0);
