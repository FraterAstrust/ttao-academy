/**
 * functions/_shared/utils.js
 */

// ── TEXT CODECS ───────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── BASE64URL ─────────────────────────────────────────────────────────────────
function b64url(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let str = '';
    bytes.forEach(b => (str += String.fromCharCode(b)));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function fromB64url(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const b64    = padded + '='.repeat((4 - padded.length % 4) % 4);
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── JWT (HMAC-SHA256) ─────────────────────────────────────────────────────────
async function hmacKey(secret, usage) {
    return crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, usage
    );
}

export async function signJWT(payload, secret, expiresInSec = 604800) {
    const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const claims = b64url(enc.encode(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresInSec,
    })));
    const input = `${header}.${claims}`;
    const key   = await hmacKey(secret, ['sign']);
    const sig   = await crypto.subtle.sign('HMAC', key, enc.encode(input));
    return `${input}.${b64url(sig)}`;
}

export async function verifyJWT(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const input = `${parts[0]}.${parts[1]}`;
    const key   = await hmacKey(secret, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, fromB64url(parts[2]), enc.encode(input));
    if (!valid) throw new Error('Invalid signature');
    const payload = JSON.parse(dec.decode(fromB64url(parts[1])));
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
    return payload;
}

// ── PASSWORD HASHING (PBKDF2 — native WebCrypto, works in CF Workers) ─────────
// 210,000 iterations matches 2023 OWASP recommendation for PBKDF2-SHA256.
export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key  = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
        key, 256
    );
    const hex = arr => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
    const [saltHex, hashHex] = (stored || '').split(':');
    if (!saltHex || !hashHex) return false;
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key  = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits   = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
        key, 256
    );
    const newHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    // Constant-time comparison to prevent timing attacks
    if (newHex.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < newHex.length; i++) diff |= newHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
}

// ── USERNAME VALIDATION ───────────────────────────────────────────────────────
const RESERVED_USERNAMES = new Set([
    'admin', 'headmaster', 'astrust', 'sysop', 'moderator', 'mod',
    'system', 'ttao', 'support', 'root', 'null', 'undefined', 'anonymous',
    'guest', 'owner', 'operator', 'staff', 'help', 'info', 'noreply',
    'deleted', 'ghost', 'bot', 'server',
]);

/** Returns an error string, or null if valid. */
export function validateUsername(u) {
    if (!u || u.length < 3)  return 'Username must be at least 3 characters.';
    if (u.length > 30)       return 'Username must be 30 characters or fewer.';
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9 ._-]*[A-Za-z0-9])?$/.test(u))
        return 'Must start and end with a letter or number. Allowed characters: letters, numbers, spaces, dot, underscore, dash.';
    if (/[._-]{2}/.test(u)) return 'No consecutive . _ - characters.';
    if (RESERVED_USERNAMES.has(u.toLowerCase())) return 'That username is reserved.';
    return null;
}

// ── COOKIES ───────────────────────────────────────────────────────────────────
export function parseCookies(request) {
    const cookies = {};
    (request.headers.get('Cookie') || '').split(';').forEach(part => {
        const [k, ...v] = part.trim().split('=');
        if (k) cookies[k.trim()] = v.join('=').trim();
    });
    return cookies;
}

export function cookieHeader(name, value, {
    maxAge, secure, httpOnly = false, sameSite = 'Lax', path = '/'
} = {}) {
    const parts = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
    if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
    if (secure)   parts.push('Secure');
    if (httpOnly) parts.push('HttpOnly');
    return parts.join('; ');
}

export const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days
export const SETUP_DURATION   = 30 * 60;           // 30 minutes

export const sessionCookie     = t => cookieHeader('ttao_session', t, { maxAge: SESSION_DURATION, secure: true, httpOnly: true, sameSite: 'Lax' });
export const setupCookie       = t => cookieHeader('ttao_setup',   t, { maxAge: SETUP_DURATION,   secure: true, httpOnly: true, sameSite: 'Lax' });
export const clearSessionCookie = () => cookieHeader('ttao_session', '', { maxAge: 0, secure: true, httpOnly: true });
export const clearSetupCookie   = () => cookieHeader('ttao_setup',   '', { maxAge: 0, secure: true, httpOnly: true });

// ── SETUP JWT — short-lived, single-purpose ────────────────────────────────────
// Used between Patreon callback and /setup completion.
// payload: { patreonId, email, name, tier, isReset, existingUserId? }
export async function signSetupJWT(payload, env) {
    return signJWT({ ...payload, _scope: 'setup' }, env.JWT_SECRET, SETUP_DURATION);
}
export async function verifySetupJWT(request, env) {
    const token = parseCookies(request).ttao_setup;
    if (!token) return null;
    try {
        const p = await verifyJWT(token, env.JWT_SECRET);
        return p._scope === 'setup' ? p : null;
    } catch { return null; }
}

// ── RESPONSE HELPERS ──────────────────────────────────────────────────────────
export function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
    });
}

export function redirect(url, extraHeaders = {}) {
    return new Response(null, {
        status: 302,
        headers: { Location: url, ...extraHeaders },
    });
}

// ── TIER SYSTEM ───────────────────────────────────────────────────────────────
export const TIER_RANK = { tyro: 0, zelator: 1, initiate: 2, adept: 3, scholar: 4 };

export function getAdminIds(env) {
    return (env.PATREON_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function getTier(amountCents, userId, env) {
    if (getAdminIds(env).includes(userId)) return 'adept';
    if (amountCents >= 3300) return 'scholar';
    if (amountCents >= 1500) return 'adept';
    if (amountCents >= 1000) return 'initiate';
    if (amountCents >= 500)  return 'zelator';
    return 'tyro';
}

export function isPaidMember(tier) {
    return (TIER_RANK[tier] ?? 0) >= TIER_RANK.zelator;
}

// ── AUTH GUARDS ───────────────────────────────────────────────────────────────
export async function requireSession(request, env) {
    const token = parseCookies(request).ttao_session;
    if (!token) return null;
    try { return await verifyJWT(token, env.JWT_SECRET); } catch { return null; }
}

export async function requireAdmin(request, env) {
    const token = parseCookies(request).ttao_admin;
    if (!token) return null;
    try {
        const p = await verifyJWT(token, env.JWT_ADMIN_SECRET);
        return p.role === 'admin' ? p : null;
    } catch { return null; }
}

// ── CONTENT HELPERS ───────────────────────────────────────────────────────────
export function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function normalizeType(item) { return item.contentType || 'articles'; }

export function extractExcerpt(content, maxLen = 180) {
    return content
        .replace(/^\[gate:[^\]]+\]\s*/gm, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_`~]/g, '')
        .replace(/\n+/g, ' ')
        .trim().slice(0, maxLen).replace(/\s\S*$/, '…');
}

// ── KV STORE WRAPPER (articles + rate-limit still use KV) ────────────────────
export function kvStore(kv) {
    return {
        async get(key)           { return kv.get(key, { type: 'json' }); },
        async setJSON(key, val)  { await kv.put(key, JSON.stringify(val)); },
        async delete(key)        { await kv.delete(key); },
        async list(prefix = '')  {
            const r = await kv.list(prefix ? { prefix } : undefined);
            return r.keys.map(k => ({ key: k.name }));
        },
    };
}
