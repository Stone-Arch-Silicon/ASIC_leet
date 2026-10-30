// Tests for the GitHub sign-in Worker. Run: node tests/worker.test.mjs
import assert from 'node:assert/strict';
import worker, { safeNext, makeSession, readSession } from '../worker/index.js';

const ORIGIN = 'https://asic-leet.example.workers.dev';
const baseEnv = {
  ALLOWED_ORG: 'Stone-Arch-Silicon',
  GITHUB_CLIENT_ID: 'Iv1.testclient',
  GITHUB_CLIENT_SECRET: 'test-secret-value',
  ASSETS: { fetch: async req => new Response(`asset:${new URL(req.url).pathname}`, { status: 200, headers: { 'Content-Type': 'text/plain' } }) },
};

let membership = { status: 200, body: { state: 'active' } };
const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = init.method || 'GET';
  calls.push({ url, method, init });
  if (url === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(init.body);
    assert.equal(body.client_secret, 'test-secret-value');
    return Response.json(body.code === 'good' ? { access_token: 'gho_test' } : { error: 'bad_verification_code' });
  }
  if (url === 'https://api.github.com/user') return Response.json({ login: 'avi' });
  if (url === 'https://api.github.com/user/memberships/orgs/Stone-Arch-Silicon') {
    return membership.status === 200 ? Response.json(membership.body) : new Response('{}', { status: membership.status });
  }
  if (url.startsWith('https://api.github.com/applications/') && method === 'DELETE') return new Response(null, { status: 204 });
  throw new Error(`unexpected fetch ${method} ${url}`);
};

const waits = [];
const ctx = { waitUntil: p => waits.push(p) };
const get = (path, headers = {}, env = baseEnv) => worker.fetch(new Request(ORIGIN + path, { headers }), env, ctx);
const html = { Accept: 'text/html,application/xhtml+xml' };
const cookieValue = (res, name) => {
  const all = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('Set-Cookie')];
  const c = all.find(x => x && x.startsWith(name + '='));
  return c ? c.slice(name.length + 1).split(';')[0] : null;
};

// safeNext blocks open redirects
assert.equal(safeNext('/'), '/');
assert.equal(safeNext('/index.html?x=1'), '/index.html?x=1');
for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil', '/auth/login', '', null, '/a b']) assert.equal(safeNext(bad), '/', String(bad));

// Not configured -> 503
assert.equal((await get('/', html, { ...baseEnv, GITHUB_CLIENT_SECRET: '' })).status, 503);

// No session: pages redirect to login, data requests get 401
let r = await get('/', html);
assert.equal(r.status, 302);
assert.equal(r.headers.get('Location'), `${ORIGIN}/auth/login?next=%2F`);
assert.equal((await get('/lab-problems.json', { Accept: '*/*' })).status, 401);

// Login sets a short-lived state cookie and redirects to GitHub with read:org
r = await get('/auth/login?next=%2Findex.html');
assert.equal(r.status, 302);
const gh = new URL(r.headers.get('Location'));
assert.equal(gh.origin + gh.pathname, 'https://github.com/login/oauth/authorize');
assert.equal(gh.searchParams.get('client_id'), 'Iv1.testclient');
assert.equal(gh.searchParams.get('scope'), 'read:org');
assert.equal(gh.searchParams.get('redirect_uri'), `${ORIGIN}/auth/callback`);
const stateCookie = cookieValue(r, '__Host-asicleet_oauth');
assert.ok(stateCookie && stateCookie.startsWith(gh.searchParams.get('state') + '.'));
assert.match(r.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);

// Open redirect attempt through next is neutralised
const evil = await get('/auth/login?next=%2F%2Fevil.com');
const evilState = cookieValue(evil, '__Host-asicleet_oauth');
assert.equal(Buffer.from(evilState.split('.')[1], 'base64url').toString(), '/');

// Callback with the wrong state is rejected
r = await get(`/auth/callback?code=good&state=WRONG`, { Cookie: `__Host-asicleet_oauth=${stateCookie}` });
assert.equal(r.status, 400);

// Callback with matching state and an active member -> session cookie and redirect to next
const state = gh.searchParams.get('state');
r = await get(`/auth/callback?code=good&state=${state}`, { Cookie: `__Host-asicleet_oauth=${stateCookie}` });
assert.equal(r.status, 302);
assert.equal(r.headers.get('Location'), `${ORIGIN}/index.html`);
const session = cookieValue(r, '__Host-asicleet_session');
assert.ok(session);
await Promise.all(waits);
assert.ok(calls.some(c => c.method === 'DELETE' && c.url.includes('/applications/Iv1.testclient/token')), 'token revoked');

// With the session cookie, assets are served privately
r = await get('/lab-problems.json', { Cookie: `__Host-asicleet_session=${session}` });
assert.equal(r.status, 200);
assert.equal(await r.text(), 'asset:/lab-problems.json');
assert.equal(r.headers.get('Cache-Control'), 'private, no-cache');

// Tampered, expired, or foreign-key sessions are rejected
const [p, s] = session.split('.');
const tampered = (p[0] === 'A' ? 'B' : 'A') + p.slice(1) + '.' + s;
assert.equal((await get('/', { ...html, Cookie: `__Host-asicleet_session=${tampered}` })).status, 302);
const old = await makeSession(baseEnv, 'avi', Date.now() - 8 * 24 * 3600 * 1000);
assert.equal(await readSession(baseEnv, old), null);
const foreign = await makeSession({ GITHUB_CLIENT_SECRET: 'other-secret' }, 'avi');
assert.equal(await readSession(baseEnv, foreign), null);
assert.equal((await readSession(baseEnv, session)).u, 'avi');

// Non-members, pending invitations, and blocked checks all get 403 and no session
for (const [m, text] of [[{ status: 404 }, 'only for members'], [{ status: 200, body: { state: 'pending' } }, 'pending invitation'], [{ status: 403 }, 'third-party access']]) {
  membership = m;
  const lr = await get('/auth/login');
  const st = new URL(lr.headers.get('Location')).searchParams.get('state');
  r = await get(`/auth/callback?code=good&state=${st}`, { Cookie: `__Host-asicleet_oauth=${cookieValue(lr, '__Host-asicleet_oauth')}` });
  assert.equal(r.status, 403);
  assert.equal(cookieValue(r, '__Host-asicleet_session'), null);
  assert.ok((await r.text()).includes(text), text);
}

// A bad OAuth code fails cleanly
membership = { status: 200, body: { state: 'active' } };
const lr2 = await get('/auth/login');
const st2 = new URL(lr2.headers.get('Location')).searchParams.get('state');
r = await get(`/auth/callback?code=bad&state=${st2}`, { Cookie: `__Host-asicleet_oauth=${cookieValue(lr2, '__Host-asicleet_oauth')}` });
assert.equal(r.status, 502);

// Logout clears the session
r = await get('/auth/logout');
assert.match(r.headers.get('Set-Cookie'), /__Host-asicleet_session=; Path=\/; Max-Age=0/);

console.log('PASS: worker sign-in gate (redirects, state, membership, sessions, logout)');
