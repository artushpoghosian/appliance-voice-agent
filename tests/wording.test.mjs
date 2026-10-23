import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opener, bannedIn, wordingReport, wordingFailures } from './lib/wording.mjs';

test('opener takes the first two words', () => {
  assert.equal(opener('Got it, a Bosch dishwasher.'), 'got it');
  assert.equal(opener("Okay. What's the address?"), "okay what's");
});

test('opener keeps numbers', () => {
  assert.equal(opener('412 Pine Street, Austin.'), '412 pine');
});

test('back-to-back counts repeated acknowledgments, not questions or numbers', () => {
  const report = wordingReport([{ id: 'Y', agentLines: [
    "What's the house number there?", "What's the street name and city?",
    '412 - Pine Street, Austin.', '414 - Pine Street, Austin.',
    'Okay. And your name?', 'Okay, what brand is it?',
  ] }]);
  assert.equal(report.backToBackShare, 1 / 6);
});

test('bannedIn finds assistant phrases in BANNED order', () => {
  assert.deepEqual(bannedIn('I can certainly help. What is your full name?'), ['certainly', 'full name']);
  assert.deepEqual(bannedIn("Sure, what's your name?"), []);
});

test('wordingReport and wordingFailures', () => {
  const report = wordingReport([{ id: 'X', agentLines: [
    'Got it, a dryer. What brand?',
    'Got it. And your name?',
    "Great, one moment while I book that. Great, it's booked.",
    'If you smell gas, leave the house and call 911 or your gas company from outside, and if there is smoke stay away from it and call 911 right away please.',
  ] }]);
  assert.equal(report.turns, 4);
  assert.equal(report.gotItShare, 0.5);
  assert.equal(report.backToBackShare, 0.25);
  assert.equal(report.maxWords, 10);
  assert.equal(report.contradictions.length, 1);
  assert.equal(wordingFailures(report).length, 4); // wordsP90 24.7, gotItShare, backToBackShare, 1 contradiction
});

test('expressive tags are not counted as spoken words', () => {
  const report = wordingReport([{ id: 'Z', agentLines: ['[empathetic] Oh no. [pause] Okay, your name?', '[pause] Okay, and the address?'] }]);
  assert.equal(report.maxWords, 5);
  assert.equal(report.backToBackShare, 0);
});
