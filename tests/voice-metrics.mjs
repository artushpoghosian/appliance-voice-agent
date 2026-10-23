// How Mia sounded on given agent versions: node --env-file=.env tests/voice-metrics.mjs --version=24[,25] [--type=web_call|phone_call]
import { summarize, formatTable } from './lib/voice-metrics.mjs';

const opts = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const env = process.env;
const need = (k) => env[k] || (console.error(`Set ${k} first.`), process.exit(1));
const API = env.RETELL_API_BASE || 'https://api.retellai.com';
const headers = { Authorization: `Bearer ${need('RETELL_API_KEY')}`, 'Content-Type': 'application/json' };
const versions = String(opts.version === true ? '' : opts.version || '').split(',').filter(Boolean).map(Number);
if (!versions.length) {
  console.error('Pass --version=N (comma-separated for several).');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const filter_criteria = { agent: [{ agent_id: need('RETELL_AGENT_ID'), version: versions }] };
if (typeof opts.type === 'string') filter_criteria.call_type = { type: 'enum', op: 'in', value: [opts.type] };

const ids = [];
let pagination_key;
do {
  const page = await api('POST', '/v3/list-calls', { filter_criteria, limit: 100, ...(pagination_key && { pagination_key }) });
  ids.push(...page.items.map((c) => c.call_id));
  pagination_key = page.has_more ? page.pagination_key : undefined;
} while (pagination_key);

const calls = [];
for (const id of ids) calls.push(await api('GET', `/v2/get-call/${encodeURIComponent(id)}`));

console.log(`Agent version ${versions.join(', ')}${typeof opts.type === 'string' ? `, ${opts.type}` : ''}`);
console.log(formatTable(summarize(calls)));
