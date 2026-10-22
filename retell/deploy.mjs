import { readFileSync } from 'node:fs';

const API = process.env.RETELL_API_BASE || 'https://api.retellai.com';
const DIR = new URL('./', import.meta.url);
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const publish = args.has('--publish');

const env = process.env;
const missing = ['RETELL_API_KEY', 'N8N_BASE_URL', 'WEBHOOK_SECRET'].filter((k) => !env[k] && !(dryRun && k === 'RETELL_API_KEY'));
if (missing.length) {
  console.error(`Set ${missing.join(', ')} first.`);
  process.exit(1);
}
const vars = { ...env, N8N_BASE_URL: env.N8N_BASE_URL.replace(/\/+$/, '') };
if (!/^https:\/\//.test(vars.N8N_BASE_URL)) {
  console.warn('Warning: N8N_BASE_URL should be a public https URL; Retell blocks localhost and private IPs.');
}

function fill(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{(file:)?([A-Za-z0-9_.-]+)\}/g, (all, isFile, name) => {
      if (isFile) return readFileSync(new URL(name, DIR), 'utf8').trim();
      if (vars[name] === undefined) throw new Error(`${all} is not set`);
      return vars[name];
    });
  }
  if (Array.isArray(value)) return value.map(fill);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]));
  return value;
}
const load = (name) => fill(JSON.parse(readFileSync(new URL(name, DIR), 'utf8')));

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${env.RETELL_API_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

const mask = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' ? v.split(env.WEBHOOK_SECRET).join('***') : v));

const llmBody = load('llm.json');
const agentBody = load('agent.json');
if (env.RETELL_VOICE_ID) agentBody.voice_id = env.RETELL_VOICE_ID;

if (dryRun) {
  console.log(JSON.stringify({ llm: mask(llmBody), agent: mask(agentBody) }, null, 2));
  process.exit(0);
}

const enc = encodeURIComponent;

async function writeLlm(ref) {
  const query = Number.isInteger(ref.version) ? `?version=${ref.version}` : '';
  const current = await api('GET', `/get-retell-llm/${enc(ref.llm_id)}${query}`);
  if (current.is_published) {
    const fresh = await api('POST', '/create-retell-llm', llmBody);
    console.log(`LLM ${ref.llm_id} v${current.version} is published; created Retell LLM ${fresh.llm_id} (version ${fresh.version})`);
    return fresh;
  }
  const llm = await api('PATCH', `/update-retell-llm/${enc(ref.llm_id)}?version=${current.version}`, llmBody);
  console.log(`Updated Retell LLM ${llm.llm_id} (version ${llm.version})`);
  return llm;
}

async function updateAgent(agentId) {
  let draft = await api('GET', `/get-agent/${enc(agentId)}`); // latest version
  if (draft.is_published) {
    const base = draft.version;
    draft = await api('POST', `/create-agent-version/${enc(agentId)}`, { base_version: base });
    console.log(`Agent version ${base} is published; created draft version ${draft.version}`);
  }
  if (draft.response_engine?.type !== 'retell-llm') {
    throw new Error(`Agent ${agentId} version ${draft.version} does not use a Retell LLM`);
  }
  const llm = await writeLlm(draft.response_engine);
  agentBody.response_engine = { type: 'retell-llm', llm_id: llm.llm_id, version: llm.version };
  const agent = await api('PATCH', `/update-agent/${enc(agentId)}?version=${draft.version}`, agentBody);
  console.log(`Updated agent ${agent.agent_id} (version ${agent.version})`);
  return { agent, llm };
}

async function createAgent() {
  const llm = await api('POST', '/create-retell-llm', llmBody);
  console.log(`Created Retell LLM ${llm.llm_id} (version ${llm.version})`);
  agentBody.response_engine = { type: 'retell-llm', llm_id: llm.llm_id, version: llm.version };
  const agent = await api('POST', '/create-agent', agentBody);
  console.log(`Created agent ${agent.agent_id} (version ${agent.version})`);
  return { agent, llm };
}

try {
  if (env.RETELL_LLM_ID && env.RETELL_AGENT_ID) {
    console.log('Note: RETELL_LLM_ID is ignored on update; the LLM comes from the agent version.');
  }
  const { agent, llm } = env.RETELL_AGENT_ID ? await updateAgent(env.RETELL_AGENT_ID) : await createAgent();

  if (publish) {
    await api('POST', `/publish-agent-version/${enc(agent.agent_id)}`, { version: agent.version });
    console.log(`Published agent version ${agent.version}`);
  }

  if (env.RETELL_PHONE_NUMBER) {
    const number = await api('PATCH', `/update-phone-number/${enc(env.RETELL_PHONE_NUMBER)}`, {
      inbound_agents: [{ agent_id: agent.agent_id, agent_version: agent.version, weight: 1 }],
    });
    const bound = (number.inbound_agents || []).find((a) => a.agent_id === agent.agent_id);
    if (!bound || Number(bound.agent_version) !== agent.version) {
      throw new Error(`Phone number did not take agent version ${agent.version}: ${JSON.stringify(number.inbound_agents)}`);
    }
    console.log(`Inbound calls to ${env.RETELL_PHONE_NUMBER} now go to agent version ${agent.version}`);
  } else {
    console.warn(`Warning: RETELL_PHONE_NUMBER is not set, so no phone number was moved to version ${agent.version}.`);
  }

  console.log(`\nexport RETELL_LLM_ID=${llm.llm_id}\nexport RETELL_AGENT_ID=${agent.agent_id}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
