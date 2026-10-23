// Loads Code nodes from the n8n workflow JSON and runs them the way n8n does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

export const root = new URL('../../', import.meta.url);
export const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function node(workflowFile, name) {
  const wf = readJson(workflowFile);
  const n = wf.nodes.find((x) => x.name === name);
  assert.ok(n, `node "${name}" not found in ${workflowFile}`);
  return n;
}

export function code(workflowFile, name) {
  const n = node(workflowFile, name);
  assert.equal(n.type, 'n8n-nodes-base.code');
  return n.parameters.jsCode;
}

export function run(jsCode, { items, vars = {}, staticData = {}, helpers } = {}) {
  const $input = { first: () => items[0], last: () => items[items.length - 1], all: () => items };
  const fn = new AsyncFunction('$input', '$json', '$vars', '$getWorkflowStaticData', 'require', 'helpers', jsCode);
  return fn($input, items[0]?.json, vars, () => staticData, require, helpers);
}

export async function validateBooking(body, staticData = {}) {
  const items = [{ json: { headers: {}, params: {}, query: {}, body } }];
  return (await run(code('n8n/wf-a-booking-function.json', 'Validate booking'), { items, staticData }))[0].json;
}
