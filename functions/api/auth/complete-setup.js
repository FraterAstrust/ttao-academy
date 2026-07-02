/**
 * POST /api/auth/complete-setup
 * Body: { username, password, confirmPassword }
 *
 * For new users:  sets username + password, completes registration.
 * For reset flow: updates password only (username already set).
 *
 * On success: issues full session JWT, clears setup cookie → { ok: true }
 * The client then redirects to /dashboard.
 */
import {
    verifySetupJWT, validateUsername, hashPassword,
    signJWT, sessionCookie, clearSetupCookie,
    json, SESSION_DURATION,
} from '../../_shared/utils.js';

export async function onRequestPost({ request, env }) {
    const setup = await verifySetupJWT(request, env);
    if (!setup) {
        return json({ error: 'Setup session expired. Please authenticate via Patreon again.' }, 401);
    }

    let body;
    try   { body = await request.json(); }
    catch { return json({ error: 'Invalid request body.' }, 400); }

    try {
        let { username, password, confirmPassword } = body;
        username = (username || '').trim();

        if (!setup.existingUserId) {
            return json({ error: 'Setup session missing user ID.' }, 400);
        }

        // ── Password validation ───────────────────────────────────────────────────
        if (!password || password.length < 8)  return json({ error: 'Password must be at least 8 characters.' }, 400);
        if (password.length > 128)             return json({ error: 'Password must be 128 characters or fewer.' }, 400);
        if (password !== confirmPassword)      return json({ error: 'Passwords do not match.' }, 400);

        // ── Username validation (skip for reset — username already set) ───────────
        if (!setup.isReset) {
            const usernameError = validateUsername(username);
            if (usernameError) return json({ error: usernameError }, 400);

            // Check uniqueness in D1 (case-insensitive)
            const taken = await env.DB
                .prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?')
                .bind(username.toLowerCase(), setup.existingUserId)
                .first();
            if (taken) return json({ error: 'That username is already taken.' }, 409);
        }

        // ── Hash password and update D1 ───────────────────────────────────────────
        const hash = await hashPassword(password);
        const now  = new Date().toISOString();

        if (setup.isReset) {
            await env.DB
                .prepare('UPDATE users SET password_hash = ?, last_seen = ? WHERE id = ?')
                .bind(hash, now, setup.existingUserId)
                .run();
        } else {
            await env.DB
                .prepare('UPDATE users SET username = ?, password_hash = ?, display_name = ?, last_seen = ? WHERE id = ?')
                .bind(username, hash, setup.name || username, now, setup.existingUserId)
                .run();
        }

        // ── Fetch final user row for JWT ──────────────────────────────────────────
        const user = await env.DB
            .prepare('SELECT id, username, tier, display_name FROM users WHERE id = ?')
            .bind(setup.existingUserId)
            .first();

        if (!user) {
            return json({ error: 'User record not found during setup.' }, 500);
        }

        const sessionToken = await signJWT({
            userId:    user.id,
            patreonId: setup.patreonId,
            email:     setup.email,
            username:  user.username,
            name:      user.display_name,
            tier:      user.tier,
        }, env.JWT_SECRET, SESSION_DURATION);

        return json({ ok: true }, 200, {
            'Set-Cookie': [sessionCookie(sessionToken), clearSetupCookie()].join(', '),
        });
    } catch (err) {
        console.error('complete-setup error:', err);
        return json({ error: err.message || 'Internal Server Error' }, 500);
    }
}
