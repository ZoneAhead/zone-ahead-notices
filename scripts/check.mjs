// Checks notices.json before it can be merged: a mistake here would reach every driver in a state.
// Run: node scripts/check.mjs [path-to-notices.json]
import { readFileSync } from 'node:fs';

export const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'ACT'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function stateOf(n) {
  const a = n.area || { type: 'state' };
  return (a.type === 'state' ? (a.state || n.state || 'VIC') : n.state) || null;
}

export function checkNotices(doc) {
  const errs = [], warn = [];
  if (!doc || !Array.isArray(doc.notices)) return { errs: ['notices.json needs a "notices" list'], warn };
  const ids = new Set();
  doc.notices.forEach((n, i) => {
    const at = `Notice ${i + 1}${n && n.id ? ` (${n.id})` : ''}`;
    const bad = m => errs.push(`${at}: ${m}`);
    if (!n || typeof n !== 'object') return bad('is not an object');
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(n.id || '')) bad('"id" must be 3-60 lowercase letters, numbers or dashes');
    else if (ids.has(n.id)) bad('"id" is used twice'); else ids.add(n.id);
    for (const k of ['title', 'text']) if (typeof n[k] !== 'string' || !n[k].trim()) bad(`"${k}" is missing`);
    if (typeof n.title === 'string' && n.title.length > 80) bad('"title" is longer than 80 characters');
    if (typeof n.text === 'string') {
      const words = n.text.trim().split(/\s+/).length;
      if (words > 60) bad(`"text" has ${words} words; keep it to 45 or so`);
      if (!/drive safely/i.test(n.text)) warn.push(`${at}: "text" doesn't end with "Please drive safely."`);
    }
    for (const k of ['starts', 'ends']) if (n[k] != null && (!ISO.test(n[k]) || isNaN(Date.parse(n[k])))) bad(`"${k}" must be a date and time with its offset, like 2026-12-24T00:00:00+11:00`);
    if (n.starts && n.ends && Date.parse(n.ends) <= Date.parse(n.starts)) bad('"ends" is before "starts"');
    if (n.ends && Date.parse(n.ends) < Date.now()) warn.push(`${at}: has already ended; it can be removed`);
    if (!n.ends) warn.push(`${at}: has no "ends", so it shows until someone removes it`);
    const a = n.area || { type: 'state' };
    if (!['state', 'circles', 'box'].includes(a.type)) bad('"area.type" must be state, circles or box');
    if (a.type === 'circles' && !(Array.isArray(a.circles) && a.circles.length && a.circles.every(c => isFinite(c.lat) && isFinite(c.lon) && c.lat < -9 && c.lat > -45 && c.lon > 112 && c.lon < 155)))
      bad('"area.circles" needs one or more { lat, lon, km, name } inside Australia');
    if (a.type === 'box' && !['n', 's', 'e', 'w'].every(k => isFinite(a[k]))) bad('"area" box needs n, s, e and w');
    const st = stateOf(n);
    if (!STATES.includes(st)) bad(a.type === 'state' ? `"area.state" must be one of ${STATES.join(', ')}` : `a ${a.type} area also needs a top-level "state" (${STATES.join(', ')}) for the push alert`);
    if (!n.source || !/^https:\/\//.test(n.source.url || '')) bad('"source.url" must be an https link to the official source');
    if (/facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com/i.test((n.source && n.source.url) || '')) bad('link the official website, not social media');
  });
  return { errs, warn };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] || 'notices.json';
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`✗ ${file} isn't valid JSON: ${e.message}`); process.exit(1); }
  const { errs, warn } = checkNotices(doc);
  warn.forEach(w => console.log(`! ${w}`));
  if (errs.length) { errs.forEach(e => console.error(`✗ ${e}`)); process.exit(1); }
  console.log(`✓ ${doc.notices.length} notice(s) look right`);
}
