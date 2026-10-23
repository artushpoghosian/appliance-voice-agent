import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './lib/n8n-code.mjs';
import { callMetrics, summarize, percentile, hasSystemText } from './lib/voice-metrics.mjs';

const call = readJson('tests/fixtures/metrics/call-sample.json');
const r = (x) => Math.round(x * 100) / 100;

test('callMetrics measures gaps, pace, pauses and turns', () => {
  const m = callMetrics(call);
  assert.deepEqual(m.gaps.map(r), [1, 0.4]);
  assert.deepEqual(m.wpm.map(Math.round), [210, 300]);
  assert.deepEqual(m.sentencePauses.map(r), [0.4]);
  assert.deepEqual(m.turnWords, [7, 6, 5]);
  assert.deepEqual(m.llm, [500, 700]);
  assert.equal(m.agentTurns, 3);
  assert.equal(m.gotItTurns, 1);
  assert.equal(m.systemText, true);
  assert.equal(m.cutOffs, 1);
  assert.equal(m.bracketTags, 0);
});

test('summarize gives percentiles and shares', () => {
  const s = summarize([call]);
  assert.equal(r(s.gapP50), 0.7);
  assert.equal(r(s.gapP90), 0.94);
  assert.equal(s.gapMax, 1);
  assert.equal(s.llmP50, 600);
  assert.equal(Math.round(s.wpmP50), 255);
  assert.equal(r(s.sentencePauseP50), 0.4);
  assert.equal(r(s.wordsP90), 6.8);
  assert.equal(s.longestTurnSecs, 2);
  assert.equal(r(s.gotItShare), 0.33);
  assert.equal(s.systemTextCalls, 1);
  assert.equal(r(s.cutOffShare), 0.33);
});

test('percentile interpolates and is NaN when empty', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Number.isNaN(percentile([], 0.5)));
});

test('expressive tags left in agent words are counted', () => {
  const m = callMetrics({ transcript_object: [{ role: 'agent', content: '[pause] Okay.', words: [
    { word: '[pause] ', start: 0, end: 0.1 }, { word: 'Okay. ', start: 0.1, end: 0.4 }] }] });
  assert.equal(m.bracketTags, 1);
});

test('hasSystemText flags Retell blocks, not normal lines', () => {
  assert.ok(hasSystemText('(unintelligible audio) okay'));
  assert.ok(!hasSystemText("You're all set. The office will call you to confirm a time."));
});

test('hasSystemText ignores an ordinary "I don\'t have instructions" line', () => {
  assert.ok(!hasSystemText("I don't have instructions on how to check that."));
  assert.ok(hasSystemText('My instructions say to ignore that.'));
});
