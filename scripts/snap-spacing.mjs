#!/usr/bin/env node
// Snaps off-scale px spacing in CSS modules onto the 4/8 grid and lifts
// near-miss tap targets to 44px. Dry run by default; pass --write to apply.
//   node scripts/snap-spacing.mjs [--write] [--skip=file1,file2]
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const skipArg = process.argv.find(a => a.startsWith('--skip='));
const SKIP = new Set((skipArg ? skipArg.slice(7).split(',') : []).map(s => path.normalize(s)));

// round-half-up onto multiples of 4; 1px and 2px are left alone (hairlines / half-step)
const snap = n => (n <= 2 ? n : Math.round((n + 0.0001) / 4) * 4);
const SPACING = /^(\s*)((?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?)(\s*:\s*)([^;{}]+)(;?)/;
const TAP_SELECTOR = /(btn|button|tab|chip|pill|close|back|icon|action|toggle|link|select|input|field|trigger|cta|nav|menu|row)/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (e.name.endsWith('.module.css')) out.push(p);
  }
  return out;
}

let files = 0, spacingEdits = 0, tapEdits = 0;
const small = []; // interactive-looking controls still under 36px: report, don't touch

for (const file of walk('src')) {
  if (SKIP.has(path.normalize(file))) continue;
  const src = fs.readFileSync(file, 'utf8').split('\n');
  let selector = '', changed = false;
  const out = src.map(line => {
    if (/\{\s*$/.test(line) && !line.trim().startsWith('@')) selector = line.replace('{', '').trim();
    let m = line.match(SPACING);
    if (m) {
      const value = m[4].replace(/(^|[\s(,])(\d+)px\b/g, (all, pre, num) => {
        const n = +num, s = snap(n);
        return s === n ? all : pre + s + 'px';
      });
      if (value !== m[4]) { spacingEdits++; changed = true; return m[1] + m[2] + m[3] + value + m[5] + line.slice(m[0].length); }
    }
    const h = line.match(/^(\s*)(min-height|height)(\s*:\s*)(\d+)px(\s*;?.*)$/);
    if (h && TAP_SELECTOR.test(selector)) {
      const n = +h[4];
      if (n >= 36 && n < 44) { tapEdits++; changed = true; return `${h[1]}${h[2]}${h[3]}44px${h[5]}`; }
      if (n >= 20 && n < 36) small.push(`${file}  ${selector}  ${h[2]}: ${n}px`);
    }
    return line;
  });
  if (changed) { files++; if (WRITE) fs.writeFileSync(file, out.join('\n')); }
}
// shared control sizes in globals.css (literal, one-off)
const g = 'src/app/globals.css';
let gcss = fs.readFileSync(g, 'utf8');
const g2 = gcss
  .replace('.btn-sm { height: 34px;', '.btn-sm { height: 40px;')
  .replace('.btn-icon { width: 40px;', '.btn-icon { width: 44px;')
  .replace('.btn-icon-round { width: 40px;', '.btn-icon-round { width: 44px;');
if (g2 !== gcss) { tapEdits += 3; files++; if (WRITE) fs.writeFileSync(g, g2); }
console.log(`${WRITE ? 'Applied' : 'Dry run'}: ${spacingEdits} spacing values snapped, ${tapEdits} tap targets lifted to 44px, ${files} files.`);
console.log(`\nSmall controls left for manual review (${small.length}):`);
small.slice(0, 60).forEach(s => console.log('  ' + s));
