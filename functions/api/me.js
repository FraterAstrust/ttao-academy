/**
 * GET /api/me
 * Returns current session user profile.
 * Cross-checks D1 for tier changes (admin override) and issues a refreshed
 * JWT if anything has changed.
 */
import {
    requireSession, signJWT, sessionCookie,
    json, SESSION_DURATION,
} from '../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    const session = await requireSession(request, env);
    if (!session) return json({ error: 'Unauthorized' }, 401);

    let { tier, username, name } = session;
    const extraHeaders = {};

    // Sync tier and profile from D1 — catches admin overrides and Patreon re-auths
    try {
        const user = await env.DB
            .prepare('SELECT tier, username, display_name FROM users WHERE id = ?')
            .bind(session.userId)
            .first();

        if (user) {
            const changed = user.tier !== tier || user.username !== username;
            tier     = user.tier;
            username = user.username;
            name     = user.display_name || name;

            if (changed) {
                const newToken = await signJWT({
                    userId:    session.userId,
                    patreonId: session.patreonId,
                    email:     session.email,
                    username,
                    name,
                    tier,
                }, env.JWT_SECRET, SESSION_DURATION);
                extraHeaders['Set-Cookie'] = sessionCookie(newToken);
            }
        }
    } catch (_) { /* non-fatal — continue with JWT values */ }

    return json({
        userId:    session.userId,
        username,
        name,
        email:     session.email,
        tier,
        expiresAt: session.exp,
    }, 200, extraHeaders);
}
