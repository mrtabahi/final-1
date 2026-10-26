const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'typing-result', 'index.ts'),
  'utf8',
);

test('typing-result authenticates the bearer token before using privileged database access', () => {
  const getUser = source.indexOf('authClient.auth.getUser(token)');
  const serviceClient = source.indexOf('createClient(url, serviceKey');
  assert.ok(getUser >= 0, 'validate the bearer token with Supabase Auth');
  assert.ok(serviceClient > getUser, 'do not initialize the service-role client before validating the user');
  assert.match(source, /if \(authError \|\| !authData\.user\) return reply\(401/);
  assert.match(source, /if \(!url \|\| !anonKey \|\| !serviceKey \|\| !token\) return reply\(401/);
});

test('starting a typing session requires a user-specific access check and an active test', () => {
  const startBranch = source.indexOf('if (body.action === "start")');
  const submitBranch = source.indexOf('if (body.action === "submit")');
  const start = source.slice(startBranch, submitBranch);
  assert.ok(startBranch >= 0 && submitBranch > startBranch, 'start and submit actions must be separate');
  assert.match(start, /db\.rpc\("can_access_test", \{ p_test_id: body\.test_id, p_user_id: user\.id \}\)/);
  assert.match(start, /if \(accessAllowed !== true\) return reply\(403/);
  assert.match(start, /\.eq\("active", true\)\.maybeSingle\(\)/);
  assert.match(start, /\.from\("profiles"\).*\.eq\("id", user\.id\)/s);
  assert.match(start, /\.insert\(\{ user_id: user\.id, test_id: test\.id \}\)/);
});

test('submitting a result scopes the session to the authenticated owner and re-checks access', () => {
  const submitBranch = source.indexOf('if (body.action === "submit")');
  const submit = source.slice(submitBranch);
  assert.match(submit, /\.from\("typing_exam_sessions"\).*\.eq\("id", sessionId\)\.eq\("user_id", user\.id\)\.maybeSingle\(\)/s);
  assert.match(submit, /if \(sessionError \|\| !session\) return reply\(404/);
  assert.match(submit, /if \(session\.submitted_at\) return reply\(409/);
  assert.match(submit, /db\.rpc\("can_access_test", \{ p_test_id: session\.test_id, p_user_id: user\.id \}\)/);
  assert.match(submit, /if \(accessAllowed !== true\) return reply\(403/);
});

test('result timing is derived server-side and client-supplied duration is not trusted', () => {
  const submit = source.slice(source.indexOf('if (body.action === "submit")'));
  assert.match(submit, /const startedAt = new Date\(session\.started_at\)\.getTime\(\)/);
  assert.match(submit, /const actualElapsed = Math\.max\(1, Math\.floor\(\(now - startedAt\) \/ 1000\)\)/);
  assert.match(submit, /Math\.min\(actualElapsed, Math\.max\(1, Number\(test\.duration_minutes\) \* 60\)\)/);
  assert.match(submit, /if \(typedText\.length > 50000\) return reply\(413/);
});

test('result submission prevents duplicate session results and reports a conflict', () => {
  const submit = source.slice(source.indexOf('if (body.action === "submit")'));
  assert.match(submit, /if \(session\.submitted_at\) return reply\(409/);
  assert.match(submit, /if \(insertError\?\.code === "23505"\) return reply\(409/);
  assert.match(submit, /\.update\(\{ submitted_at: new Date\(\)\.toISOString\(\) \}\).*\.is\("submitted_at", null\)/s);
});

test('method and action validation fail closed', () => {
  assert.match(source, /if \(req\.method !== "POST"\) return reply\(405/);
  assert.match(source, /if \(typeof body\.test_id !== "string"\) return reply\(400/);
  assert.match(source, /if \(requestedMode !== undefined && requestedMode !== "screen" && requestedMode !== "page"\) return reply\(400/);
  assert.match(source, /return reply\(400, \{ error: "Unsupported action" \}\)/);
});
