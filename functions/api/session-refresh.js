/**
 * POST /api/session-refresh
 * Refreshes the session JWT when < 24 hours remain.
 * Also syncs tier and username from D1 so admin overrides apply immediately.
 */
import {
    requireSession, signJWT, sessionCookie,
    json, SESSION_DURATION,
} from '../_shared/utils.js';

const REFRESH_WINDOW = 24 * 60 * 60; // refresh if < 24h remain

export async function onRequestPost({ request, env }) {
    const session = await requireSession(request, env);
    if (!session) return json({ error: 'Unauthorized' }, 401);

    const now      = Math.floor(Date.now() / 1000);
    const timeLeft = session.exp - now;

    // Sync from D1
    let { tier, username, name } = session;
    try {
        const user = await env.DB
            .prepare('SELECT tier, username FROM users WHERE id = ?')
            .bind(session.userId)
            .first();
        if (user) {
            tier     = user.tier;
            username = user.username;
            name     = user.username || name;
        }
    } catch (_) { /* non-fatal */ }

    const tierChanged     = tier     !== session.tier;
    const usernameChanged = username !== session.username;
    const needsRefresh    = timeLeft < REFRESH_WINDOW || tierChanged || usernameChanged;

    if (!needsRefresh) return json({ refreshed: false, expiresAt: session.exp });

    const newToken = await signJWT({
        userId:    session.userId,
        patreonId: session.patreonId,
        email:     session.email,
        username,
        name,
        tier,
    }, env.JWT_SECRET, SESSION_DURATION);

    return json({ refreshed: true, expiresAt: now + SESSION_DURATION }, 200, {
        'Set-Cookie': sessionCookie(newToken),
    });
}
