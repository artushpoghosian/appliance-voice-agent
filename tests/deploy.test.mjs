import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const deploy = (...flags) => spawnSync(process.execPath, ['retell/deploy.mjs', ...flags], {
  cwd: new URL('../', import.meta.url),
  env: { PATH: process.env.PATH, N8N_BASE_URL: 'https://n8n.example.com', WEBHOOK_SECRET: 'test-secret' },
  encoding: 'utf8',
});

test('deploy refuses --draft together with --publish', () => {
  const out = deploy('--draft', '--publish', '--dry-run');
  assert.equal(out.status, 1);
  assert.match(out.stderr, /Use --draft or --publish, not both\./);
});

test('deploy --draft --dry-run still prints the request bodies', () => {
  const out = deploy('--draft', '--dry-run');
  assert.equal(out.status, 0);
  assert.equal(JSON.parse(out.stdout).agent.voice_id, 'retell-Rita');
});
