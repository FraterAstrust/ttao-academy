/**
 * POST /api/session-refresh
 *
 * Called by dashboard.js when the session token has less than 24 hours
 * remaining. Issues a fresh 7-day token with the same (or updated) claims
 * and sets a new httpOnly cookie.
 *
 * Also re-checks STUDENTS_KV for a tier change, so an admin override is
 * applied on refresh even if /api/me was not called in between.
 *
 * Returns: { refreshed: boolean, expiresAt: number }
 */
import { requireSession, signJWT, cookieHeader, kvStore, json } from '../_shared/utils.js';

const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
const REFRESH_WINDOW   = 24 * 60 * 60;      // refresh when < 24 hours remain

export async function onRequestPost({ request, env }) {
    const session = await requireSession(request, env);
    if (!session) return json({ error: 'Unauthorized' }, 401);

    const now      = Math.floor(Date.now() / 1000);
    const timeLeft = session.exp - now;

    // Check for admin-overridden tier (non-fatal if KV unavailable)
    let tier = session.tier;
    try {
        const store  = kvStore(env.STUDENTS_KV);
        const record = await store.get(session.userId);
        if (record?.tier && record.tier !== session.tier) {
            tier = record.tier;
        }
    } catch (_) { /* continue with existing tier */ }

    // If plenty of time remains and tier hasn't changed, nothing to do.
    if (timeLeft > REFRESH_WINDOW && tier === session.tier) {
        return json({ refreshed: false, expiresAt: session.exp });
    }

    const newToken = await signJWT(
        { userId: session.userId, email: session.email, name: session.name, tier },
        env.JWT_SECRET,
        SESSION_DURATION
    );

    const newExp = now + SESSION_DURATION;

    return json({ refreshed: true, expiresAt: newExp }, 200, {
        'Set-Cookie': cookieHeader('ttao_session', newToken, {
            maxAge: SESSION_DURATION, secure: true, httpOnly: true, sameSite: 'Lax',
        }),
    });
}
