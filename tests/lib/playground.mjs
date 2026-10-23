// Runs scripted callers through Retell's playground API and checks the booking rules on the result.
import { hasSystemText } from './voice-metrics.mjs';
import { scriptedCaller } from './caller.mjs';

const FEE_SPOKEN = /\$\s?99\b|\bninety[\s-]?nine\b|\b99 dollars?\b/i;
const parse = (s) => {
  try { return JSON.parse(s); } catch { return {}; }
};

// The caller is a scripted profile (answers whatever Mia asks) or fixed lines. The playground's catch-all mock
// answers book_service_call with a placeholder; swap it for WF-A's real answer.
export async function runScenario(scenario, { complete, bookingResult, beginMessage, maxToolRounds = 3, maxTurns = 16 }) {
  const messages = [{ role: 'agent', content: beginMessage }];
  const completionMs = [];
  let ended = false;
  const lines = [...(scenario.lines || [])];
  const caller = scenario.profile ? scriptedCaller(scenario.profile) : () => lines.shift() ?? null;
  for (let turn = 0; turn < maxTurns && !ended; turn++) {
    const line = caller(messages.findLast((m) => m.role === 'agent')?.content ?? '');
    if (line == null) break;
    messages.push({ role: 'user', content: line });
    for (let round = 0; round <= maxToolRounds; round++) {
      const t0 = Date.now();
      const out = await complete(messages);
      completionMs.push(Date.now() - t0);
      const i = out.messages.findIndex((m) => m.role === 'tool_call_invocation' && m.name === 'book_service_call');
      if (i < 0) {
        messages.push(...out.messages);
        ended = Boolean(out.call_ended);
        break;
      }
      const inv = out.messages[i];
      const result = await bookingResult(parse(inv.arguments), messages.concat(out.messages.slice(0, i)));
      // Drop the placeholder result and anything said after it; continue from the real result.
      messages.push(...out.messages.slice(0, i + 1),
        { role: 'tool_call_result', tool_call_id: inv.tool_call_id, content: JSON.stringify(result) });
    }
  }
  return { id: scenario.id, messages, ended, completionMs, asked: caller.asked };
}

export const agentLines = (run) => run.messages.slice(1).filter((m) => m.role === 'agent').map((m) => m.content);

function bookings(run) {
  const results = new Map(run.messages.filter((m) => m.role === 'tool_call_result').map((m) => [m.tool_call_id, m.content]));
  return run.messages
    .filter((m) => m.role === 'tool_call_invocation' && m.name === 'book_service_call')
    .map((m) => ({ args: parse(m.arguments), result: parse(results.get(m.tool_call_id)).result }));
}

export function checkScenario(scenario, run) {
  const { expect } = scenario;
  const fail = [];
  const calls = bookings(run);
  const last = calls.filter((b) => b.result === 'booked').at(-1);
  if (expect.booking === 'none') {
    if (last) fail.push(`booked a ${last.args.job_type} job, expected no booking`);
  } else if (!last) {
    fail.push(`no booking, expected ${expect.booking}`);
  } else if (last.args.job_type !== expect.booking) {
    fail.push(`booked ${last.args.job_type}, expected ${expect.booking}`);
  }
  for (const [field, n] of Object.entries(run.asked || {})) {
    if (n > 1 && !(expect.allow_twice || []).includes(field)) fail.push(`asked for ${field} ${n} times`);
    if ((expect.not_asked || []).includes(field)) fail.push(`asked for ${field}, which the caller already gave`);
  }
  for (const l of agentLines(run)) if ((l.match(/\?/g) || []).length > 1) fail.push(`two questions in one turn: ${l}`);
  if (expect.phone && last?.args.phone !== expect.phone) fail.push(`phone ${last?.args.phone}, expected ${expect.phone}`);

  const talk = run.messages.filter((m) => m.role === 'agent' || m.role === 'user');
  const firstWarranty = talk.find((m) => /warrant/i.test(m.content));
  if (firstWarranty?.role === 'agent') fail.push(`Mia raised warranty first: ${firstWarranty.content}`);

  const lines = agentLines(run);
  if (expect.booking === 'warranty') {
    const fee = lines.find((l) => FEE_SPOKEN.test(l));
    if (fee) fail.push(`fee mentioned on a warranty job: ${fee}`);
  }
  if (expect.ends_call && !run.ended) fail.push('call did not end');

  const replyTo = (line) => {
    const i = talk.findIndex((m) => m.role === 'user' && m.content === line);
    return i < 0 ? undefined : talk.slice(i + 1).find((m) => m.role === 'agent');
  };
  if (expect.ai_after && !/\bAI\b/.test(replyTo(expect.ai_after)?.content || '')) fail.push(`no AI disclosure after "${expect.ai_after}"`);
  const firstUser = talk.find((m) => m.role === 'user')?.content;
  if (expect.safety_first && !(replyTo(firstUser)?.content || '').includes('911')) fail.push('no gas safety line first');

  for (const b of calls) {
    if (b.result === 'missing' || b.result === 'fee_required') fail.push(`booking call came too early (${b.result})`);
    if (b.args.phone !== undefined && !/^\+\d{10,15}$/.test(String(b.args.phone))) fail.push(`phone not digits-only: ${b.args.phone}`);
  }
  if (expect.phone_digits && !String(last?.args.phone ?? '').endsWith(expect.phone_digits)) {
    fail.push(`phone ${last?.args.phone}, expected ...${expect.phone_digits}`);
  }
  if (expect.address_contains && !String(last?.args.service_address ?? '').includes(expect.address_contains)) {
    fail.push(`address ${last?.args.service_address}, expected ${expect.address_contains}`);
  }
  for (const l of lines) if (hasSystemText(l)) fail.push(`system text: ${l}`);
  if (expect.agent_says && !lines.some((l) => new RegExp(expect.agent_says, 'i').test(l))) fail.push(`never said "${expect.agent_says}"`);
  return fail;
}

export function playgroundClient({ apiKey, agentId, version, dynamicVariables, base = 'https://api.retellai.com' }) {
  // Without a matching mock, Retell runs the real tool (the live n8n), so book_service_call is always mocked.
  const mock = { tool_name: 'book_service_call', input_match_rule: { type: 'any' }, output: '{"result":"pending","say":""}' };
  return async (messages) => {
    const res = await fetch(`${base}/agent-playground-completion/${encodeURIComponent(agentId)}?version=${version}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, dynamic_variables: dynamicVariables, tool_mocks: [mock] }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`playground ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  };
}
