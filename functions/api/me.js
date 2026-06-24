/**
 * GET /api/me
 * Returns the current session user's profile from the httpOnly cookie.
 * Also checks STUDENTS_KV for a tier change set by an admin override and
 * silently re-issues the JWT so the new tier takes effect immediately.
 */
import { requireSession, signJWT, cookieHeader, kvStore, json } from '../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    const session = await requireSession(request, env);
    if (!session) return json({ error: 'Unauthorized' }, 401);

    let tier         = session.tier;
    const extraHeaders = {};

    // Detect admin-overridden tier changes without forcing a full re-login.
    try {
        const store  = kvStore(env.STUDENTS_KV);
        const record = await store.get(session.userId);
        if (record && record.tier && record.tier !== session.tier) {
            tier = record.tier;
            const newToken = await signJWT(
                { userId: session.userId, email: session.email, name: session.name, tier },
                env.JWT_SECRET,
                7 * 24 * 60 * 60
            );
            extraHeaders['Set-Cookie'] = cookieHeader('ttao_session', newToken, {
                maxAge: 7 * 24 * 60 * 60, secure: true, httpOnly: true, sameSite: 'Lax',
            });
        }
    } catch (_) { /* non-fatal — continue with existing tier */ }

    return json({
        userId:    session.userId,
        name:      session.name,
        email:     session.email,
        tier,
        expiresAt: session.exp, // Unix seconds; used by dashboard.js to schedule refresh
    }, 200, extraHeaders);
}
