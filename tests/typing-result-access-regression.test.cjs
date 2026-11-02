'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../supabase/functions/typing-result/index.ts'),
  'utf8'
);

test('secure typing session start checks caller entitlement before service-role session creation', () => {
  const start = source.slice(
    source.indexOf('if (body.action === "start")'),
    source.indexOf('if (body.action === "submit")')
  );
  const accessCheck = start.indexOf('authClient.rpc("can_access_test"');
  const sessionInsert = start.indexOf('db.from("typing_exam_sessions").insert');
  assert.ok(accessCheck >= 0, 'start must call can_access_test with the user-scoped client');
  assert.ok(sessionInsert > accessCheck, 'session creation must happen after entitlement validation');
  assert.match(start, /if \(canAccessTest !== true\)/u);
  assert.match(start, /if \(accessError\)/u);
});

test('secure typing sessions reject inactive accounts at start and submit', () => {
  const start = source.slice(
    source.indexOf('if (body.action === "start")'),
    source.indexOf('if (body.action === "submit")')
  );
  const submit = source.slice(source.indexOf('if (body.action === "submit")'));
  assert.match(start, /select\("id,account_status"\)/u);
  assert.match(start, /profile\.account_status !== "active"/u);
  assert.match(submit, /select\("id,full_name,account_status"\)/u);
  assert.match(submit, /profile\.account_status !== "active"/u);
});

test('secure typing session entitlement check fails closed on RPC errors', () => {
  const start = source.slice(
    source.indexOf('if (body.action === "start")'),
    source.indexOf('if (body.action === "submit")')
  );
  assert.match(start, /if \(accessError\)[\s\S]*return reply\(503/u);
  assert.match(start, /if \(canAccessTest !== true\)[\s\S]*return reply\(403/u);
});
