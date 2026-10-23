import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { root, readJson, node, code, run, validateBooking } from './lib/n8n-code.mjs';

const expected = readJson('tests/fixtures/expected.json');

const WF_A = 'n8n/wf-a-booking-function.json';
const WF_B = 'n8n/wf-b-post-call-alert.json';
const WF_ERR = 'n8n/error-alert.json';

// WF-A

describe('WF-A Validate booking', () => {
  const validate = code(WF_A, 'Validate booking');
  const fixture = (name) => readJson(`tests/fixtures/booking/${name}.json`);
  const webhookItem = (body) => ({ json: { headers: {}, params: {}, query: {}, body } });
  const go = async (body, staticData = {}) => (await run(validate, { items: [webhookItem(body)], staticData }))[0].json;

  test('validateBooking helper runs the Validate booking node', async () => {
    const out = await validateBooking(readJson('tests/fixtures/booking/warranty-lg.json'));
    assert.equal(out.result, 'booked');
    assert.equal(out.append_row, true);
  });

  for (const [name, result] of Object.entries(expected.booking)) {
    test(`fixture ${name} -> ${result}`, async () => {
      const out = await go(fixture(name));
      assert.equal(out.result, result);
      assert.deepEqual(out.response, { result: out.result, say: out.say });
      assert.equal(out.append_row, result === 'booked');
    });
  }

  test('booked: say is NEXT_STEPS and the row matches the sheet header', async () => {
    const out = await go(fixture('standard-fee-accepted'));
    assert.equal(out.say, "You're all set. The office will call you to confirm a time.");
    assert.deepEqual(Object.keys(out.row), [
      'logged_at', 'call_id', 'job_type', 'caller_name', 'phone', 'service_address',
      'appliance', 'brand', 'issue', 'fee_accepted', 'notes',
    ]);
    assert.equal(out.row.call_id, 'call_fx_standard_ok');
    assert.equal(out.row.appliance, 'dryer');
    assert.equal(out.row.fee_accepted, 'yes');
    assert.equal(out.row.notes, 'Side gate code 4411');
    assert.ok(!Number.isNaN(Date.parse(out.row.logged_at)));
  });

  test('fee_required: fee quoted but fee_accepted missing', async () => {
    const body = fixture('standard-fee-accepted');
    delete body.args.fee_accepted;
    const out = await go(body);
    assert.equal(out.result, 'fee_required');
    assert.equal(out.say, "Before I book it, there's a $99 service call fee for the technician to come out. Is that okay?");
  });

  test('fee_required: fee_accepted false', async () => {
    const body = fixture('standard-fee-accepted');
    body.args.fee_accepted = false;
    assert.equal((await go(body)).result, 'fee_required');
  });

  test('fee_required: only the caller mentioned $99, the agent never did', async () => {
    const body = fixture('standard-fee-not-stated');
    body.call.transcript_object.push({ role: 'user', content: 'Is it the $99 visit?' });
    body.call.transcript += '\nUser: Is it the $99 visit?';
    assert.equal((await go(body)).result, 'fee_required');
  });

  test('booked: fee spoken as "ninety-nine dollars"', async () => {
    const body = fixture('standard-fee-not-stated');
    body.call.transcript_object.push({ role: 'agent', content: 'There is a ninety-nine dollar service call fee. Is that okay?' });
    body.call.transcript_object.push({ role: 'user', content: 'Yes.' });
    assert.equal((await go(body)).result, 'booked');
  });

  test('booked: plain transcript string when transcript_object is absent', async () => {
    const body = fixture('standard-fee-accepted');
    delete body.call.transcript_object;
    assert.equal((await go(body)).result, 'booked');
  });

  const withEnding = (lines) => {
    const body = fixture('standard-fee-accepted');
    body.call.transcript_object = body.call.transcript_object.slice(0, -2).concat(lines.map(([role, content]) => ({ role, content })));
    delete body.call.transcript;
    return body;
  };
  const FEE = "Just so you know, there's a $99 service call fee for the technician to come out. Is that okay?";

  test('fee_required: caller declined the fee, then said "let\'s book it" without a new fee line', async () => {
    const body = withEnding([
      ['agent', FEE], ['user', "No, it's too much for me."],
      ['agent', "No problem. If you change your mind, just give us a call. Is there anything else I can help with?"],
      ['user', "Okay, let's book it anyway."],
    ]);
    assert.equal((await go(body)).result, 'fee_required');
  });

  test('booked: declined, then the fee line again and a clear yes', async () => {
    const body = withEnding([
      ['agent', FEE], ['user', 'No, $99 is too much.'],
      ['agent', 'No problem. Is there anything else I can help with?'], ['user', "Let's book it."],
      ['agent', FEE], ['user', "Yeah, that's fine."],
    ]);
    assert.equal((await go(body)).result, 'booked');
  });

  test('fee_required: caller asked a question about the fee and never said yes', async () => {
    const body = withEnding([
      ['agent', FEE], ['user', 'Before I agree, does the $99 go toward the repair cost?'],
      ['agent', "I don't have that information, but I'll pass that question to the team."],
    ]);
    assert.equal((await go(body)).result, 'fee_required');
  });

  test('fee_required: fee line with no answer yet', async () => {
    assert.equal((await go(withEnding([['agent', FEE]]))).result, 'fee_required');
  });

  for (const answer of ["I'm not sure.", 'Nope.', 'Hmm, no, $99 is too much for me.', 'No, but just book it.', "No, that's not okay.", "Don't do it.", 'Do not book it.']) {
    test(`fee_required: answer "${answer}" is not a yes`, async () => {
      assert.equal((await go(withEnding([['agent', FEE], ['user', answer]]))).result, 'fee_required');
    });
  }

  for (const answer of ['Yes, no problem.', 'Sure, go ahead.', 'Yes. This is very fine.', 'Go for it.', "Let's do it.", 'Book it.']) {
    test(`booked: answer "${answer}" is a yes`, async () => {
      assert.equal((await go(withEnding([['agent', FEE], ['user', answer]]))).result, 'booked');
    });
  }

  test('fee_required: declined in the plain transcript string', async () => {
    const body = fixture('standard-fee-accepted');
    delete body.call.transcript_object;
    body.call.transcript = body.call.transcript.replace(/User: Yeah, that's fine\.$/, "User: No, that's too much.\nAgent: No problem.\nUser: Book it anyway.");
    assert.equal((await go(body)).result, 'fee_required');
  });

  test('fee_required: transcript missing entirely', async () => {
    const body = fixture('standard-fee-accepted');
    delete body.call.transcript_object;
    delete body.call.transcript;
    assert.equal((await go(body)).result, 'fee_required');
  });

  for (const brand of ['LG', 'l.g.', 'Samsung', 'GE', 'G.E.', 'GE Profile', 'General Electric']) {
    test(`warranty brand "${brand}" is covered with no fee`, async () => {
      const body = fixture('warranty-lg');
      body.args.brand = brand;
      const out = await go(body);
      assert.equal(out.result, 'booked');
      assert.equal(out.row.fee_accepted, 'n/a (warranty)');
    });
  }

  for (const brand of ['Whirlpool', 'Gemini', 'Maytag', 'Bosch']) {
    test(`warranty brand "${brand}" -> not_covered`, async () => {
      const body = fixture('warranty-lg');
      body.args.brand = brand;
      const out = await go(body);
      assert.equal(out.result, 'not_covered');
      assert.match(out.say, /LG, Samsung( and|,) GE/);
      assert.match(out.say, /\$99/);
      assert.match(out.say, /Is that okay\?$/);
      assert.equal(out.append_row, false);
    });
  }

  test('missing: names the missing field', async () => {
    const out = await go(fixture('missing-address'));
    assert.equal(out.result, 'missing');
    assert.equal(out.say, "What's the address for the visit?");
  });

  for (const name of ['standard-fee-accepted', 'warranty-lg']) {
    test(`missing: ${name} address without a house number -> ask for it`, async () => {
      const body = fixture(name);
      body.args.service_address = 'Chekhov Street, Yerevan';
      const out = await go(body);
      assert.equal(out.result, 'missing');
      assert.equal(out.say, "What's the house number there?");
      assert.equal(out.append_row, false);
    });
  }

  test('booked: no house number when notes say the caller has none', async () => {
    const body = fixture('standard-fee-accepted');
    body.args.service_address = 'Chekhov Street, Yerevan';
    body.args.notes = 'No house number: caller does not know it.';
    assert.equal((await go(body)).result, 'booked');
  });

  test('missing: several fields, whitespace-only counts as missing', async () => {
    const body = fixture('standard-fee-accepted');
    body.args.brand = '   ';
    delete body.args.phone;
    const out = await go(body);
    assert.equal(out.result, 'missing');
    assert.equal(out.say, "What's the best number to reach you?");
  });

  for (const phone of ['{{user_number}}', 'this number', '+1 555', '+145679101111']) {
    test(`missing: phone "${phone}" has no real number -> ask for one`, async () => {
      const body = fixture('warranty-lg');
      body.args.phone = phone;
      const out = await go(body);
      assert.equal(out.result, 'missing');
      assert.equal(out.say, "What's the best number to reach you?");
      assert.equal(out.append_row, false);
    });
  }

  test('missing: invalid job_type', async () => {
    const body = fixture('standard-fee-accepted');
    body.args.job_type = 'premium';
    const out = await go(body);
    assert.equal(out.result, 'missing');
    assert.match(out.say, /job_type/);
  });

  test('missing: no args at all', async () => {
    const out = await go({ name: 'book_service_call', call: { call_id: 'x' } });
    assert.equal(out.result, 'missing');
  });

  test('duplicate call_id -> booked again, no second row', async () => {
    const staticData = {};
    const first = await go(fixture('standard-fee-accepted'), staticData);
    const second = await go(fixture('standard-fee-accepted'), staticData);
    assert.equal(first.result, 'booked');
    assert.equal(first.append_row, true);
    assert.equal(second.result, 'booked');
    assert.equal(second.append_row, false);
    assert.equal(second.duplicate, true);
    const other = fixture('warranty-lg');
    assert.equal((await go(other, staticData)).append_row, true);
  });

  test('same call, changed details -> a correction row; the same again -> no row', async () => {
    const staticData = {};
    const first = fixture('standard-fee-accepted');
    assert.equal((await go(first, staticData)).append_row, true);
    const changed = fixture('standard-fee-accepted');
    changed.args.service_address = '414 Oak Street, Austin, TX';
    const fixed = await go(changed, staticData);
    assert.equal(fixed.result, 'booked');
    assert.equal(fixed.append_row, true);
    assert.equal(fixed.row.service_address, '414 Oak Street, Austin, TX');
    assert.match(fixed.row.notes, /^Correction of an earlier booking in this call\. Side gate code 4411$/);
    const again = await go(changed, staticData);
    assert.equal(again.append_row, false);
    assert.equal(again.duplicate, true);
  });

  test('a call_id that was refused can still book later', async () => {
    const staticData = {};
    const body = fixture('standard-fee-accepted');
    body.args.fee_accepted = false;
    assert.equal((await go(body, staticData)).result, 'fee_required');
    body.args.fee_accepted = true;
    const out = await go(body, staticData);
    assert.equal(out.result, 'booked');
    assert.equal(out.append_row, true);
  });
});

// WF-B

const KEY = 'key_test_webhook_badge_123';
const sign = (raw, key = KEY, ts = Date.now()) =>
  `v=${ts},d=${crypto.createHmac('sha256', key).update(raw + ts).digest('hex')}`;

function rawItem(raw, signature) {
  const headers = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-retell-signature'] = signature;
  return {
    json: { headers, params: {}, query: {}, body: JSON.parse(raw) },
    binary: { data: { data: Buffer.from(raw).toString('base64'), mimeType: 'application/json' } },
  };
}
const helpersFor = (raw) => ({ getBinaryDataBuffer: async (i, prop) => {
  assert.equal(i, 0); assert.equal(prop, 'data'); return Buffer.from(raw);
} });

describe('WF-B Verify signature', () => {
  const verify = code(WF_B, 'Verify signature');
  const raw = readFileSync(new URL('tests/fixtures/post-call/standard-booking.json', root), 'utf8');

  test('valid signature (binary buffer helper) -> parsed payload', async () => {
    const out = await run(verify, { items: [rawItem(raw, sign(raw))], vars: { RETELL_WEBHOOK_KEY: KEY }, helpers: helpersFor(raw) });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].json, JSON.parse(raw));
  });

  test('valid signature (base64 fallback, no helpers)', async () => {
    const out = await run(verify, { items: [rawItem(raw, sign(raw))], vars: { RETELL_WEBHOOK_KEY: KEY } });
    assert.equal(out[0].json.event, 'call_analyzed');
  });

  test('invalid: wrong key', async () => {
    await assert.rejects(
      run(verify, { items: [rawItem(raw, sign(raw, 'other_key'))], vars: { RETELL_WEBHOOK_KEY: KEY } }),
      /invalid signature/i);
  });

  test('invalid: body tampered after signing', async () => {
    const sig = sign(raw);
    const tampered = raw.replace('Maria Lopez', 'Mallory');
    await assert.rejects(
      run(verify, { items: [rawItem(tampered, sig)], vars: { RETELL_WEBHOOK_KEY: KEY } }),
      /invalid signature/i);
  });

  test('invalid: digest of wrong length', async () => {
    await assert.rejects(
      run(verify, { items: [rawItem(raw, `v=${Date.now()},d=abcd`)], vars: { RETELL_WEBHOOK_KEY: KEY } }),
      /invalid signature/i);
  });

  test('invalid: missing or malformed header', async () => {
    await assert.rejects(run(verify, { items: [rawItem(raw)], vars: { RETELL_WEBHOOK_KEY: KEY } }), /signature/i);
    await assert.rejects(run(verify, { items: [rawItem(raw, 'garbage')], vars: { RETELL_WEBHOOK_KEY: KEY } }), /signature/i);
  });

  test('stale: signed 6 minutes ago', async () => {
    const sig = sign(raw, KEY, Date.now() - 6 * 60 * 1000);
    await assert.rejects(run(verify, { items: [rawItem(raw, sig)], vars: { RETELL_WEBHOOK_KEY: KEY } }), /stale/i);
  });

  test('stale: timestamp 6 minutes in the future', async () => {
    const sig = sign(raw, KEY, Date.now() + 6 * 60 * 1000);
    await assert.rejects(run(verify, { items: [rawItem(raw, sig)], vars: { RETELL_WEBHOOK_KEY: KEY } }), /stale/i);
  });

  test('4 minutes old is still accepted', async () => {
    const sig = sign(raw, KEY, Date.now() - 4 * 60 * 1000);
    const out = await run(verify, { items: [rawItem(raw, sig)], vars: { RETELL_WEBHOOK_KEY: KEY } });
    assert.equal(out.length, 1);
  });

  test('no key configured -> clear error', async () => {
    await assert.rejects(run(verify, { items: [rawItem(raw, sign(raw))], vars: {} }), /RETELL_WEBHOOK_KEY/);
  });

  test('constant in the node is used when $vars is unavailable', async () => {
    const patched = verify.replace(/const RETELL_WEBHOOK_KEY_CONSTANT = '[^']*';/, `const RETELL_WEBHOOK_KEY_CONSTANT = '${KEY}';`);
    assert.notEqual(patched, verify, 'constant line not found');
    const out = await run(patched, { items: [rawItem(raw, sign(raw))], vars: undefined });
    assert.equal(out[0].json.event, 'call_analyzed');
  });

  test('raw body option off -> clear error', async () => {
    const item = rawItem(raw, sign(raw));
    delete item.binary;
    await assert.rejects(run(verify, { items: [item], vars: { RETELL_WEBHOOK_KEY: KEY } }), /Raw Body/);
  });
});

describe('WF-B Filter', () => {
  test('keeps only event === "call_analyzed"', () => {
    const f = node(WF_B, 'Only call_analyzed');
    assert.equal(f.type, 'n8n-nodes-base.filter');
    const [c] = f.parameters.conditions.conditions;
    assert.equal(f.parameters.conditions.conditions.length, 1);
    assert.equal(c.leftValue, '={{ $json.event }}');
    assert.equal(c.rightValue, 'call_analyzed');
    assert.deepEqual(c.operator, { type: 'string', operation: 'equals' });
  });
});

describe('WF-B Build alert', () => {
  const build = code(WF_B, 'Build alert');
  const payload = (name) => readJson(`tests/fixtures/post-call/${name}.json`);
  const go = async (p, staticData = {}) => run(build, { items: [{ json: p }], staticData });

  const marks = {
    standard_booking: '🔧', warranty_booking: '🛡️', warranty_company_message: '📨',
    no_booking: '⚠️', spam: '🚫', other: '📞',
  };

  for (const [name, template] of Object.entries(expected['post-call'])) {
    if (!template) continue;
    test(`fixture ${name} -> ${template}`, async () => {
      const [out] = await go(payload(name));
      assert.equal(out.json.template, template);
      assert.ok(out.json.text.startsWith(marks[template]), out.json.text);
      assert.equal(out.json.silent, template === 'spam');
      assert.ok(out.json.text.length <= 4096);
      assert.doesNotMatch(out.json.text, /undefined|null|NaN|\[object/);
    });
  }

  test('standard booking shows the booking details, fee, and recording link', async () => {
    const [{ json }] = await go(payload('standard-booking'));
    for (const s of ['Maria Lopez', '+15125550142', '412 Oak Street, Austin, TX', 'dryer', 'Whirlpool', 'Not heating', '$99', 'Side gate code 4411', '3m 12s']) {
      assert.ok(json.text.includes(s), `missing ${s}`);
    }
    assert.match(json.text, /<a href="https:\/\/dxc03zgurdly9\.cloudfront\.net\/call_fx_pc_standard\/recording\.wav">/);
  });

  test('warranty booking shows the brand and no fee', async () => {
    const [{ json }] = await go(payload('warranty-booking'));
    assert.match(json.text, /LG/);
    assert.match(json.text, /no fee/i);
    assert.doesNotMatch(json.text, /\$99/);
  });

  test('warranty-company message shows name, company, callback number, job', async () => {
    const [{ json }] = await go(payload('warranty-company'));
    for (const s of ['Jen Alvarez', 'American Home Shield', '+18005550111', 'work order 88-1234']) {
      assert.ok(json.text.includes(s), `missing ${s}`);
    }
  });

  test('no booking says the fee was declined', async () => {
    const [{ json }] = await go(payload('no-booking'));
    assert.match(json.text, /fee declined/i);
    assert.match(json.text, /Tom Reed/);
  });

  test('spam is one silent line', async () => {
    const [{ json }] = await go(payload('spam'));
    assert.equal(json.silent, true);
    assert.equal(json.text.split('\n').length, 1);
    assert.match(json.text, /\+12025550999/);
  });

  test('outcome "dropped" for a customer -> no_booking (hung up)', async () => {
    const p = payload('no-booking');
    p.call.call_analysis.custom_analysis_data.outcome = 'dropped';
    const [{ json }] = await go(p);
    assert.equal(json.template, 'no_booking');
    assert.match(json.text, /hung up/i);
  });

  test('HTML is escaped in every value', async () => {
    const p = payload('standard-booking');
    p.call.call_analysis.custom_analysis_data.caller_name = '<b>Bob</b> & "Co"';
    p.call.call_analysis.call_summary = 'Use <script>alert(1)</script> & stuff';
    p.call.recording_url = 'https://x.test/a?b=1&c="2"';
    const [{ json }] = await go(p);
    assert.ok(json.text.includes('&lt;b&gt;Bob&lt;/b&gt; &amp; "Co"') || json.text.includes('&lt;b&gt;Bob&lt;/b&gt; &amp; &quot;Co&quot;'));
    assert.ok(json.text.includes('Use &lt;script&gt;alert(1)&lt;/script&gt; &amp; stuff'));
    assert.ok(json.text.includes('href="https://x.test/a?b=1&amp;c=&quot;2&quot;"'));
    assert.doesNotMatch(json.text, /<script>|<b>Bob/);
  });

  test('other/web call: escaped summary and dashes for missing values', async () => {
    const [{ json }] = await go(payload('other-callback-webcall'));
    assert.ok(json.text.includes('&lt;callback&gt; today &amp; soon'));
    assert.match(json.text, /Caller ID: —/);
    assert.match(json.text, /Callback: —/);
    assert.match(json.text, /Sam O'Neil/);
  });

  test('call with no analysis data at all -> other, every field "—", nothing invented', async () => {
    const p = payload('standard-booking');
    delete p.call.call_analysis;
    delete p.call.from_number;
    delete p.call.recording_url;
    delete p.call.duration_ms;
    delete p.call.start_timestamp;
    const [{ json }] = await go(p);
    assert.equal(json.template, 'other');
    assert.doesNotMatch(json.text, /undefined|null|NaN|Invalid Date/);
    assert.match(json.text, /Summary: —/);
    assert.match(json.text, /Recording: —/);
  });

  test('start time is shown in the company time zone', async () => {
    const tz = build.match(/const TIME_ZONE = '([^']+)'/)[1];
    const [{ json }] = await go(payload('standard-booking'));
    const want = new Date(1792512000000).toLocaleString('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    assert.ok(json.text.includes(want), `expected ${want}`);
  });

  test('very long values stay within 4096 characters with balanced tags', async () => {
    const p = payload('standard-booking');
    p.call.call_analysis.call_summary = 'x & y '.repeat(3000);
    p.call.call_analysis.custom_analysis_data.notes = 'n'.repeat(5000);
    const [{ json }] = await go(p);
    assert.ok(json.text.length <= 4096, `length ${json.text.length}`);
    assert.equal((json.text.match(/<b>/g) || []).length, (json.text.match(/<\/b>/g) || []).length);
    assert.equal((json.text.match(/<a /g) || []).length, (json.text.match(/<\/a>/g) || []).length);
    assert.doesNotMatch(json.text, /&[a-z]*$/m, 'cut inside an entity');
  });

  test('a repeated delivery of the same call is sent once', async () => {
    const staticData = {};
    assert.equal((await go(payload('standard-booking'), staticData)).length, 1);
    assert.equal((await go(payload('standard-booking'), staticData)).length, 0);
    assert.equal((await go(payload('spam'), staticData)).length, 1);
  });
});

// error workflow

describe('Error workflow Format error', () => {
  const fmt = code(WF_ERR, 'Format error');

  test('formats workflow name and error, escaped', async () => {
    const [{ json }] = await run(fmt, { items: [{ json: {
      execution: { id: '231', url: 'https://n8n.example.com/execution/231', error: { message: 'Invalid <signature> & stuff' }, lastNodeExecuted: 'Verify signature' },
      workflow: { id: '1', name: 'Retell WF-B <post-call>' },
    } }] });
    assert.ok(json.text.startsWith('⚠️ Retell WF-B &lt;post-call&gt; failed: Invalid &lt;signature&gt; &amp; stuff'));
    assert.match(json.text, /Verify signature/);
    assert.match(json.text, /href="https:\/\/n8n\.example\.com\/execution\/231"/);
  });

  test('trigger errors (no execution) still format', async () => {
    const [{ json }] = await run(fmt, { items: [{ json: {
      trigger: { error: { message: 'Webhook down' }, mode: 'trigger' }, workflow: { id: '2', name: 'WF-A' },
    } }] });
    assert.ok(json.text.startsWith('⚠️ WF-A failed: Webhook down'));
    assert.doesNotMatch(json.text, /undefined|null/);
  });
});

// import readiness

describe('Workflow JSON is import-ready', () => {
  for (const file of [WF_A, WF_B, WF_ERR]) {
    test(`${file}: unique names, valid connections, no secrets`, () => {
      const wf = readJson(file);
      const names = wf.nodes.map((n) => n.name);
      assert.equal(new Set(names).size, names.length);
      for (const [from, outs] of Object.entries(wf.connections)) {
        assert.ok(names.includes(from), `connection from unknown node ${from}`);
        for (const branch of outs.main) for (const c of branch) assert.ok(names.includes(c.node), `unknown target ${c.node}`);
      }
      const text = JSON.stringify(wf);
      assert.doesNotMatch(text, /key_[A-Za-z0-9]{20,}|bot\d+:[A-Za-z0-9_-]{30,}/, 'looks like a real secret');
      assert.equal(wf.settings.executionOrder, 'v1');
    });
  }

  test('WF-A webhook: header auth + respond via node', () => {
    const w = node(WF_A, 'Webhook');
    assert.equal(w.parameters.path, 'retell/book-service-call');
    assert.equal(w.parameters.httpMethod, 'POST');
    assert.equal(w.parameters.authentication, 'headerAuth');
    assert.equal(w.parameters.responseMode, 'responseNode');
    assert.equal(w.credentials.httpHeaderAuth.name, 'Retell booking secret');
  });

  test('WF-A IF -> Sheets (retry, continue) -> Respond; false branch -> Respond', () => {
    const wf = readJson(WF_A);
    const iff = node(WF_A, 'IF new booking');
    assert.equal(iff.parameters.conditions.conditions[0].leftValue, '={{ $json.append_row }}');
    assert.deepEqual(wf.connections['IF new booking'].main[0].map((c) => c.node), ['Append to Jobs sheet']);
    assert.deepEqual(wf.connections['IF new booking'].main[1].map((c) => c.node), ['Respond to Retell']);
    assert.deepEqual(wf.connections['Append to Jobs sheet'].main[0].map((c) => c.node), ['Respond to Retell']);
    const sheets = node(WF_A, 'Append to Jobs sheet');
    assert.equal(sheets.parameters.operation, 'append');
    assert.equal(sheets.parameters.sheetName.value, 'Jobs');
    assert.equal(sheets.retryOnFail, true);
    assert.equal(sheets.maxTries, 3);
    assert.equal(sheets.onError, 'continueRegularOutput');
    assert.ok(sheets.credentials.googleSheetsOAuth2Api);
    const cols = sheets.parameters.columns.schema.map((s) => s.id);
    assert.deepEqual(cols, ['logged_at', 'call_id', 'job_type', 'caller_name', 'phone', 'service_address', 'appliance', 'brand', 'issue', 'fee_accepted', 'notes']);
    assert.deepEqual(Object.keys(sheets.parameters.columns.value), cols);
    const respond = node(WF_A, 'Respond to Retell');
    assert.equal(respond.parameters.respondWith, 'json');
    assert.match(respond.parameters.responseBody, /\$\('Validate booking'\)/);
  });

  test('WF-B webhook: respond immediately, raw body on', () => {
    const w = node(WF_B, 'Retell webhook');
    assert.equal(w.parameters.path, 'retell/post-call');
    assert.equal(w.parameters.responseMode, 'onReceived');
    assert.equal(w.parameters.options.rawBody, true);
  });

  for (const [file, name, retries] of [[WF_B, 'Send to Call Feed', 4], [WF_ERR, 'Send to Call Feed', undefined]]) {
    test(`${file} Telegram node: HTML, no attribution, credential name`, () => {
      const t = node(file, name);
      assert.equal(t.type, 'n8n-nodes-base.telegram');
      assert.equal(t.parameters.text, '={{ $json.text }}');
      assert.equal(t.parameters.additionalFields.parse_mode, 'HTML');
      assert.equal(t.parameters.additionalFields.appendAttribution, false);
      assert.equal(t.credentials.telegramApi.name, 'Telegram - Call Feed');
      if (retries) {
        assert.equal(t.retryOnFail, true);
        assert.equal(t.maxTries, retries);
        assert.equal(t.parameters.additionalFields.disable_notification, '={{ $json.silent }}');
      }
    });
  }
});
