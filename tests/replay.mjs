import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const opts = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const env = process.env;
const need = (k) => env[k] || (console.error(`Set ${k} first.`), process.exit(1));
const base = need('N8N_BASE_URL').replace(/\/+$/, '') + (opts.test ? '/webhook-test' : '/webhook');
const fixture = (p) => JSON.parse(readFileSync(new URL(`fixtures/${p}.json`, import.meta.url), 'utf8'));
const expected = fixture('expected');
const runId = Date.now().toString(36);
let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
};

async function booking() {
  const secret = need('WEBHOOK_SECRET');
  const url = `${base}/retell/book-service-call`;
  const post = (body, headers = { 'X-Webhook-Secret': secret }) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  console.log(`\nWF-A ${url}`);
  for (const [name, want] of Object.entries(expected.booking)) {
    const body = fixture(`booking/${name}`);
    body.call.call_id = `${body.call.call_id}_${runId}`;
    const res = await post(body);
    const data = await res.json().catch(() => ({}));
    report(res.ok && data.result === want, `${name} -> ${want}`, `got ${res.status} ${JSON.stringify(data)}`);
  }

  const dup = fixture('booking/standard-fee-accepted');
  dup.call.call_id = `${dup.call.call_id}_${runId}`;
  const res = await post(dup);
  const data = await res.json().catch(() => ({}));
  report(data.result === 'booked', 'duplicate call_id -> booked (check: only one Sheet row for it)', dup.call.call_id);

  const unauth = await post(fixture('booking/standard-fee-accepted'), { 'X-Webhook-Secret': 'wrong' });
  report(unauth.status === 401 || unauth.status === 403, 'wrong X-Webhook-Secret is refused', `got ${unauth.status}`);
}

async function postCall() {
  const key = env.RETELL_WEBHOOK_KEY || need('RETELL_API_KEY');
  const url = `${base}/retell/post-call`;
  console.log(`\nWF-B ${url}`);
  const send = (raw, signature) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-retell-signature': signature }, body: raw });

  for (const [name, template] of Object.entries(expected['post-call'])) {
    const payload = fixture(`post-call/${name}`);
    const now = Date.now();
    const duration = payload.call.duration_ms || 60000;
    Object.assign(payload.call, { call_id: `${payload.call.call_id}_${runId}`, start_timestamp: now - duration, end_timestamp: now });
    const raw = JSON.stringify(payload);
    const ts = String(Date.now());
    const digest = crypto.createHmac('sha256', key).update(raw + ts).digest('hex');
    const res = await send(raw, `v=${ts},d=${digest}`);
    report(res.ok, `${name} -> ${template ? `expect ${template} alert` : 'expect no alert (filtered)'}`, `HTTP ${res.status}`);
  }

  if (opts['bad-signature']) {
    const raw = JSON.stringify(fixture('post-call/standard-booking'));
    const res = await send(raw, `v=${Date.now()},d=${'0'.repeat(64)}`);
    report(res.ok, 'bad signature sent -> expect a ⚠️ "failed: Invalid signature" error alert, no call alert', `HTTP ${res.status}`);
  }
}

if (opts.only !== 'post-call') await booking();
if (opts.only !== 'booking') await postCall();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll HTTP checks passed. Now check Telegram and the Sheet.');
process.exit(failures ? 1 : 0);
