import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prompt = readFileSync(new URL('../retell/system-prompt.md', import.meta.url), 'utf8');

test('prompt keeps the unclear-opening rule', () => {
  assert.match(prompt, /If the opening is unclear, such as silence or "Hi, is this the owner\?", let them talk before deciding\./);
  assert.match(prompt, /Someone who wants a person or calls about an existing job is never spam\./);
});
