import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runScenario, checkScenario } from './lib/playground.mjs';

test('runScenario replaces the mocked booking result with the real one', async () => {
  const seen = [];
  const replies = [
    { messages: [{ role: 'agent', content: 'Sure, what brand?' }] },
    { messages: [
      { role: 'tool_call_invocation', tool_call_id: 't1', name: 'book_service_call', arguments: '{"job_type":"standard"}' },
      { role: 'tool_call_result', tool_call_id: 't1', content: '{"result":"pending"}' },
      { role: 'agent', content: 'placeholder reply' }] },
    { messages: [{ role: 'agent', content: "You're all set." }] },
  ];
  const complete = async (history) => { seen.push(history.map((m) => m.role)); return replies.shift(); };
  const bookingResult = async () => ({ result: 'booked', say: "You're all set." });
  const run = await runScenario({ id: 'T', lines: ['My dryer is broken.', 'Yes.'] }, { complete, bookingResult, beginMessage: 'Hi.' });
  assert.deepEqual(seen[2].slice(-2), ['tool_call_invocation', 'tool_call_result']);
  assert.ok(!run.messages.some((m) => m.content === 'placeholder reply'));
  assert.equal(JSON.parse(run.messages.find((m) => m.role === 'tool_call_result').content).result, 'booked');
  assert.equal(run.completionMs.length, 3);
});

const booked = (args) => [
  { role: 'tool_call_invocation', tool_call_id: 't1', name: 'book_service_call', arguments: JSON.stringify(args) },
  { role: 'tool_call_result', tool_call_id: 't1', content: JSON.stringify({ result: 'booked' }) },
];

test('checkScenario flags Mia raising warranty, a wrong job type and a dashed phone', () => {
  const run = { ended: false, messages: [
    { role: 'agent', content: 'Hi.' }, { role: 'user', content: 'My Samsung washer is broken.' },
    { role: 'agent', content: 'Is it under warranty?' },
    ...booked({ job_type: 'warranty', phone: '512 - 555 - 0142' })] };
  assert.equal(checkScenario({ id: 'A7', expect: { booking: 'standard' } }, run).length, 3);
});

test('checkScenario flags a booking call made before the details or the fee line', () => {
  const run = { ended: false, messages: [
    { role: 'agent', content: 'Hi.' }, { role: 'user', content: 'My LG washer is under warranty.' },
    { role: 'tool_call_invocation', tool_call_id: 't1', name: 'book_service_call', arguments: JSON.stringify({ job_type: 'warranty', phone: '+15125550142' }) },
    { role: 'tool_call_result', tool_call_id: 't1', content: JSON.stringify({ result: 'missing', say: "What's the house number there?" }) }] };
  assert.deepEqual(checkScenario({ id: 'C1', expect: { booking: 'none' } }, run), ['booking call came too early (missing)']);
});

test('checkScenario passes a clean warranty booking', () => {
  const run = { ended: true, messages: [
    { role: 'agent', content: 'Hi.' }, { role: 'user', content: 'My LG fridge is under warranty.' },
    { role: 'agent', content: 'Okay. And your name?' },
    ...booked({ job_type: 'warranty', phone: '+15125550142' }),
    { role: 'agent', content: "You're all set." }] };
  assert.deepEqual(checkScenario({ id: 'C1', expect: { booking: 'warranty', ends_call: true } }, run), []);
});

test('checkScenario flags a detail asked twice, two questions in one turn and a wrong phone', () => {
  const run = { ended: false, asked: { name: 2, address: 1 }, messages: [
    { role: 'agent', content: 'Hi.' }, { role: 'user', content: 'My dryer is broken.' },
    { role: 'agent', content: 'What brand is it? And your name?' },
    ...booked({ job_type: 'standard', phone: '+5125550110' })] };
  const failures = checkScenario({ id: 'S2', expect: { booking: 'standard', phone: '+15125550110' } }, run);
  assert.deepEqual(failures, [
    'asked for name 2 times',
    'two questions in one turn: What brand is it? And your name?',
    'phone +5125550110, expected +15125550110',
  ]);
});

test('checkScenario allows a detail the caller changed and flags one already given', () => {
  const run = { ended: false, asked: { phone: 2, name: 1 }, messages: [{ role: 'agent', content: 'Hi.' }] };
  const failures = checkScenario({ id: 'S5', expect: { booking: 'none', allow_twice: ['phone'], not_asked: ['name'] } }, run);
  assert.deepEqual(failures, ['asked for name, which the caller already gave']);
});

test('checkScenario requires a line the scenario expects Mia to say', () => {
  const run = { ended: false, messages: [{ role: 'agent', content: 'Hi.' }, { role: 'agent', content: "You're all set." }] };
  assert.deepEqual(checkScenario({ id: 'S7', expect: { booking: 'none', agent_says: 'no service call fee' } }, run),
    ['never said "no service call fee"']);
});
