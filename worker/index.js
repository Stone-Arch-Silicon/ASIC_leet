// GitHub sign-in gate for the ASIC Practice site (Cloudflare Worker + static assets).
// Every request runs this Worker first (assets.run_worker_first). Only people who sign in
// with GitHub and are active members of ALLOWED_ORG can load anything in ./dist.
//
// Config
//   vars (wrangler.jsonc): ALLOWED_ORG, GITHUB_CLIENT_ID   (public values)
//   secret (Cloudflare dashboard): GITHUB_CLIENT_SECRET     (never commit it)
// Routes
//   /auth/login?next=/path  -> GitHub authorize (scope read:org)
//   /auth/callback          -> checks membership, sets a signed session cookie
//   /auth/logout            -> clears the session cookie

const SESSION_COOKIE = '__Host-asicleet_session';
const STATE_COOKIE = '__Host-asicleet_oauth';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const STATE_SECONDS = 10 * 60;
const UA = 'asic-leet-auth';
const te = new TextEncoder();
const td = new TextDecoder();

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};

const b64url = buf => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function readCookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Only same-site paths such as /#x or /index.html. Blocks //host, /\host and auth routes.
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])[^\s]*$/.test(next) && !next.startsWith('/auth/') ? next : '/';
}

let keyCache = null;
async function sessionKey(secret) {
  if (keyCache && keyCache.secret === secret) return keyCache.key;
  // Derive a dedicated HMAC key from the OAuth client secret so only one secret has to be stored.
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: te.encode('asic-leet'), info: te.encode('session-v1') },
    base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
  keyCache = { secret, key };
  return key;
}

export async function makeSession(env, login, now = Date.now()) {
  const payload = b64url(te.encode(JSON.stringify({ u: login, exp: Math.floor(now / 1000) + SESSION_SECONDS })));
  const sig = await crypto.subtle.sign('HMAC', await sessionKey(env.GITHUB_CLIENT_SECRET), te.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function readSession(env, value, now = Date.now()) {
  const parts = (value || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await sessionKey(env.GITHUB_CLIENT_SECRET), unb64url(parts[1]), te.encode(parts[0]));
    if (!ok) return null;
    const data = JSON.parse(td.decode(unb64url(parts[0])));
    return typeof data.u === 'string' && typeof data.exp === 'number' && data.exp > now / 1000 ? data : null;
  } catch {
    return null;
  }
}

function page(status, title, body, headers = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ASIC Practice</title><style>:root{--bg:#f6f5f0;--fg:#1f2a24;--muted:#5d6a62;--accent:#2f5d46}@media (prefers-color-scheme:dark){:root{--bg:#141916;--fg:#e6e9e4;--muted:#9aa69f;--accent:#7fb495}}body{font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;max-width:34rem;margin:14vh auto;padding:0 16px;color:var(--fg);background:var(--bg)}p{color:var(--muted)}a.btn{display:inline-block;margin-top:10px;padding:10px 16px;background:var(--accent);color:var(--bg);border-radius:8px;text-decoration:none;font-weight:600}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY, ...headers } });
}
const signInButton = '<a class="btn" href="/auth/login">Sign in with GitHub</a>';

function login(url, env, redirectUri) {
  const next = safeNext(url.searchParams.get('next') || '/');
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  gh.searchParams.set('redirect_uri', redirectUri);
  gh.searchParams.set('scope', 'read:org');
  gh.searchParams.set('state', state);
  gh.searchParams.set('allow_signup', 'false');
  return new Response(null, {
    status: 302,
    headers: { Location: gh.toString(), 'Set-Cookie': cookie(STATE_COOKIE, `${state}.${b64url(te.encode(next))}`, STATE_SECONDS), 'Cache-Control': 'no-store' },
  });
}

async function callback(request, url, env, ctx, redirectUri) {
  const [state, nextB64] = (readCookies(request)[STATE_COOKIE] || '').split('.');
  const clearState = { 'Set-Cookie': cookie(STATE_COOKIE, '', 0) };
  const code = url.searchParams.get('code');
  if (!state || !code || !sameString(state, url.searchParams.get('state') || '')) {
    return page(400, 'Sign-in expired', `<p>That sign-in link is no longer valid. Please try again.</p>${signInButton}`, clearState);
  }
  let next = '/';
  try { next = safeNext(td.decode(unb64url(nextB64 || ''))); } catch { next = '/'; }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tok.access_token) {
    return page(502, 'GitHub sign-in failed', `<p>GitHub did not return a sign-in token. Please try again.</p>${signInButton}`, clearState);
  }

  const api = path => fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': UA },
  });
  const [userRes, memRes] = await Promise.all([api('/user'), api(`/user/memberships/orgs/${encodeURIComponent(env.ALLOWED_ORG)}`)]);
  const user = userRes.ok ? await userRes.json().catch(() => ({})) : {};
  const mem = memRes.ok ? await memRes.json().catch(() => ({})) : {};

  // The token is only needed for these two calls. Revoke it so nothing long-lived exists.
  const revoke = fetch(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ access_token: tok.access_token }),
  }).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(revoke);

  const who = typeof user.login === 'string' ? user.login : '';
  if (!who || mem.state !== 'active') {
    let why = `This site is only for members of the <b>${esc(env.ALLOWED_ORG)}</b> GitHub organization. Ask an organization owner to add you.`;
    if (mem.state === 'pending') why = `You have a pending invitation to <b>${esc(env.ALLOWED_ORG)}</b>. Accept it on GitHub, then sign in again.`;
    else if (memRes.status === 403) why = `GitHub blocked the membership check. An owner of <b>${esc(env.ALLOWED_ORG)}</b> may need to approve this app under the organization's third-party access settings.`;
    return page(403, 'Members only', `<p>Signed in as <b>@${esc(who || 'unknown')}</b>. ${why}</p><a class="btn" href="/auth/logout">Use a different account</a>`, clearState);
  }

  const headers = new Headers({ Location: `${url.origin}${next}`, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, await makeSession(env, who), SESSION_SECONDS));
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.ALLOWED_ORG) {
      return page(503, 'Sign-in is not set up yet', '<p>The site owner still needs to finish the GitHub sign-in settings.</p>');
    }
    const redirectUri = `${url.origin}/auth/callback`;
    if (url.pathname === '/auth/login') return login(url, env, redirectUri);
    if (url.pathname === '/auth/callback') return callback(request, url, env, ctx, redirectUri);
    if (url.pathname === '/auth/logout') {
      return page(200, 'Signed out', `<p>You are signed out of ASIC Practice.</p>${signInButton}`, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
    }

    const session = await readSession(env, readCookies(request)[SESSION_COOKIE]);
    if (!session) {
      const wantsPage = request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');
      if (wantsPage) return Response.redirect(`${url.origin}/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
      return new Response('Sign in required', { status: 401, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...SECURITY } });
    }

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-cache');
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    return out;
  },
};
