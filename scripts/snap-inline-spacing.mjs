#!/usr/bin/env node
// Snaps off-scale inline spacing in JSX style objects onto the 4/8 grid.
// Handles padding/margin/gap (+ side variants) given as numbers or px strings.
// Dry run by default.   node scripts/snap-inline-spacing.mjs <dir> [--write]
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'src';
const WRITE = process.argv.includes('--write');
const snap = n => (n <= 2 ? n : Math.round((n + 0.0001) / 4) * 4);

const KEY = '(?:padding|margin|gap|rowGap|columnGap)(?:Top|Right|Bottom|Left|Inline|Block)?';
const NUM = new RegExp(`(\\b${KEY}\\s*:\\s*)(\\d+)(\\s*[,}])`, 'g');          // padding: 10,
const STR = new RegExp(`(\\b${KEY}\\s*:\\s*)(['"])([^'"\\n]*)\\2`, 'g');        // padding: '10px 14px'

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

let files = 0, edits = 0;
for (const file of walk(root)) {
  const src = fs.readFileSync(file, 'utf8');
  let n = 0;
  let next = src.replace(NUM, (all, pre, num, post) => {
    const s = snap(+num); if (s === +num) return all; n++; return pre + s + post;
  });
  next = next.replace(STR, (all, pre, q, val) => {
    if (!/\d/.test(val) || /[a-z]{2,}\(/.test(val) || /(?:%|em|vh|vw|var|calc)/.test(val)) return all; // leave calc/var/% alone
    const v = val.replace(/(^|\s)(\d+)(px)?(?=\s|$)/g, (m, sp, num, px) => {
      const s = snap(+num); if (s === +num) return m; n++; return sp + s + (px || '');
    });
    return v === val ? all : pre + q + v + q;
  });
  if (n) { files++; edits += n; if (WRITE) fs.writeFileSync(file, next); }
}
console.log(`${WRITE ? 'Applied' : 'Dry run'}: ${edits} inline values snapped in ${files} files under ${root}.`);
