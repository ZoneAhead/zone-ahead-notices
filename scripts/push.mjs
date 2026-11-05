// Sends a push alert for each notice that is live now and hasn't been sent yet, to the phones in its state.
// Phones subscribe to one Firebase topic for the state they're in: za-vic, za-nsw, za-qld, za-sa or za-act.
// Runs from GitHub Actions after a notice is merged, and every hour (for notices that start later).
// Needs the repository secret FIREBASE_SERVICE_ACCOUNT (the Firebase service account key, JSON).
// Without it, or with DRY_RUN=1, it only prints what it would send.
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { checkNotices, stateOf } from './check.mjs';

const ZONE = { VIC: 'Australia/Melbourne', NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide' };
const QUIET = [21, 7];            // no alerts from 9 pm to 7 am local time; they wait for the morning
const TOKEN_URL = process.env.ZA_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const FCM_URL = process.env.ZA_FCM_URL || 'https://fcm.googleapis.com/v1/projects/{p}/messages:send';
const now = process.env.ZA_NOW ? Date.parse(process.env.ZA_NOW) : Date.now();

const doc = JSON.parse(readFileSync('notices.json', 'utf8'));
const { errs } = checkNotices(doc);
if (errs.length) { errs.forEach(e => console.error(`✗ ${e}`)); process.exit(1); }
let sent = { sent: {} };
try { sent = JSON.parse(readFileSync('sent.json', 'utf8')); sent.sent = sent.sent || {}; } catch { }

const localHour = st => Number(new Intl.DateTimeFormat('en-AU', { timeZone: ZONE[st], hour: 'numeric', hourCycle: 'h23' }).format(now));
const due = doc.notices.filter(n => {
  if (n.push === false || sent.sent[n.id]) return false;
  if (n.starts && Date.parse(n.starts) > now) return false;                      // not started yet
  if (n.ends && Date.parse(n.ends) - now < 2 * 3600e3) return false;            // over, or nearly over
  const h = localHour(stateOf(n));
  if (h >= QUIET[0] || h < QUIET[1]) { console.log(`… ${n.id}: waiting until 7 am in ${stateOf(n)}`); return false; }
  return true;
});
if (!due.length) { console.log('Nothing to send.'); process.exit(0); }

const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const dry = process.env.DRY_RUN === '1' || !keyJson;
if (dry) console.log(keyJson ? 'DRY_RUN: not sending.' : 'No FIREBASE_SERVICE_ACCOUNT secret yet: not sending, and not marking anything as sent.');

const b64 = s => Buffer.from(s).toString('base64url');
async function accessToken(sa) {
  const t = Math.floor(now / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: TOKEN_URL, iat: t, exp: t + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key, 'base64url');
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Couldn't sign in to Firebase (${r.status}): ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

function message(n) {
  const st = stateOf(n);
  return {
    topic: `za-${st.toLowerCase()}`,
    notification: { title: n.title, body: n.text },
    data: { kind: 'notice', id: n.id },
    android: { priority: 'high', notification: { channel_id: 'za-notices', color: '#1c2f57', tag: n.id } },
    apns: { headers: { 'apns-collapse-id': n.id.slice(0, 64) }, payload: { aps: { sound: 'default' } } }
  };
}

let sa = null, token = null, failed = 0;
if (!dry) { sa = JSON.parse(keyJson); token = await accessToken(sa); }
for (const n of due) {
  const m = message(n);
  if (dry) { console.log(`→ would send to ${m.topic}: ${n.title} — ${n.text}`); continue; }
  const r = await fetch(FCM_URL.replace('{p}', sa.project_id), { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ message: m }) });
  if (r.ok) { sent.sent[n.id] = new Date(now).toISOString(); console.log(`✓ sent to ${m.topic}: ${n.title}`); }
  else { failed++; console.error(`✗ ${n.id}: Firebase said ${r.status} ${(await r.text()).slice(0, 300)}`); }
}
if (!dry) writeFileSync('sent.json', JSON.stringify(sent, null, 2) + '\n');
if (failed) process.exit(1);
