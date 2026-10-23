// Runs test callers through Retell's playground: no calls, and booking answered by WF-A's real Validate code.
// node --env-file=.env tests/playground.mjs --version=24 [--set=quick|full] [--only=A1,B1]
import { mkdirSync, writeFileSync } from 'node:fs';
import { readJson, validateBooking } from './lib/n8n-code.mjs';
import { runScenario, checkScenario, playgroundClient, agentLines } from './lib/playground.mjs';
import { wordingReport, wordingFailures, LIMITS } from './lib/wording.mjs';
import { percentile } from './lib/voice-metrics.mjs';

const opts = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const env = process.env;
const need = (k) => env[k] || (console.error(`Set ${k} first.`), process.exit(1));
const version = Number(opts.version);
if (!Number.isInteger(version)) {
  console.error('Pass --version=N (the agent version to test).');
  process.exit(1);
}
const set = ['full', 'stress'].includes(opts.set) ? opts.set : 'quick';
const only = typeof opts.only === 'string' ? opts.only.split(',') : null;

const llm = readJson('retell/llm.json');
const vars = llm.default_dynamic_variables || {};
const beginMessage = llm.begin_message.replace(/\{\{(\w+)\}\}/g, (all, k) => vars[k] ?? all);
// Caller ID for the playground; a scenario can set "user_number": "" to act like a web call with none.
const clientFor = (scenario) => playgroundClient({
  apiKey: need('RETELL_API_KEY'),
  agentId: need('RETELL_AGENT_ID'),
  version,
  dynamicVariables: { user_number: scenario.user_number ?? '+15125550142' },
});

const scenarios = readJson('tests/fixtures/playground/scenarios.json')
  .filter((s) => (only ? only.includes(s.id) : set === 'full' || s.set === set));
const runId = Date.now().toString(36);
const pct = (v) => `${Math.round(v * 100)}%`;
const runs = [];
let failures = 0;

for (const scenario of scenarios) {
  const staticData = {};
  const bookingResult = async (args, history) => {
    const transcript_object = history.filter((m) => m.role === 'agent' || m.role === 'user').map(({ role, content }) => ({ role, content }));
    const out = await validateBooking({ args, call: { call_id: `pg_${scenario.id}_${runId}`, transcript_object } }, staticData);
    return out.response;
  };
  let run;
  let problems;
  try {
    run = await runScenario(scenario, { complete: clientFor(scenario), bookingResult, beginMessage });
    problems = checkScenario(scenario, run);
  } catch (err) {
    run = { id: scenario.id, messages: [], ended: false, completionMs: [] };
    problems = [`error: ${err.message}`];
  }
  failures += problems.length;
  runs.push({ ...run, problems });
  console.log(`${problems.length ? '✗' : '✓'} ${scenario.id}${problems.length ? `: ${problems.join(' | ')}` : ''}`);
}

const report = wordingReport(runs.map((r) => ({ id: r.id, agentLines: agentLines(r) })));
const wording = wordingFailures(report);
failures += wording.length;
console.log(`\nWording over ${report.turns} turns: words p90 ${Math.round(report.wordsP90 * 10) / 10} (≤ ${LIMITS.wordsP90}), `
  + `longest ${report.maxWords} words (≤ ${LIMITS.maxWords}), "Got it" ${pct(report.gotItShare)} (≤ ${pct(LIMITS.gotItShare)}), `
  + `same opener twice ${pct(report.backToBackShare)} (≤ ${pct(LIMITS.backToBackShare)})`);
for (const w of wording) console.log(`✗ ${w}`);
console.log(`Median completion: ${Math.round(percentile(runs.flatMap((r) => r.completionMs), 0.5))} ms`);

const dir = new URL('../notes/runs/', import.meta.url);
mkdirSync(dir, { recursive: true });
const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-v${version}.json`;
writeFileSync(new URL(name, dir), JSON.stringify({ version, set, runs, report }, null, 2));
console.log(`Runs saved to notes/runs/${name}`);
process.exit(failures ? 1 : 0);
