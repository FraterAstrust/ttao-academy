/**
 * POST /api/auth/login
 * Body: { identifier, password }
 * identifier may be email address OR username.
 *
 * Returns { ok: true } on success and sets ttao_session cookie.
 * Returns { error } on failure — deliberately vague to prevent user enumeration.
 */
import {
    verifyPassword, signJWT,
    sessionCookie, json, SESSION_DURATION,
} from '../../_shared/utils.js';

const GENERIC_ERROR = 'Incorrect credentials.';

export async function onRequestPost({ request, env }) {
    let body;
    try   { body = await request.json(); }
    catch { return json({ error: 'Invalid request body.' }, 400); }

    const { identifier, password } = body;
    if (!identifier || !password) return json({ error: GENERIC_ERROR }, 401);

    // Look up by email OR username
    const isEmail = identifier.includes('@');
    const normalized = identifier.trim().toLowerCase();
    const user    = await env.DB
        .prepare(
            isEmail
                ? 'SELECT id, patreon_id, email, username, display_name, tier, password_hash FROM users WHERE LOWER(email) = ?'
                : 'SELECT id, patreon_id, email, username, display_name, tier, password_hash FROM users WHERE LOWER(username) = ?'
        )
        .bind(normalized)
        .first();

    // No user or setup incomplete
    if (!user || !user.password_hash) return json({ error: GENERIC_ERROR }, 401);

    // Verify password
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return json({ error: GENERIC_ERROR }, 401);

    // Update last_seen
    await env.DB
        .prepare('UPDATE users SET last_seen = ? WHERE id = ?')
        .bind(new Date().toISOString(), user.id)
        .run();

    // Issue session JWT
    const token = await signJWT({
        userId:    user.id,
        patreonId: user.patreon_id,
        email:     user.email,
        username:  user.username,
        name:      user.display_name,
        tier:      user.tier,
    }, env.JWT_SECRET, SESSION_DURATION);

    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}
