/**
 * GET /api/auth/check-username?username={u}
 * Called from the setup page as the user types.
 * Returns { available: boolean, error?: string }
 */
import { verifySetupJWT, validateUsername, json } from '../../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    // Must have a valid setup session to check usernames
    const setup = await verifySetupJWT(request, env);
    if (!setup) return json({ error: 'Unauthorized.' }, 401);

    const url      = new URL(request.url);
    const username = (url.searchParams.get('username') || '').trim();

    const validationError = validateUsername(username);
    if (validationError) return json({ available: false, error: validationError });

    const taken = await env.DB
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .bind(username, setup.existingUserId || '')
        .first();

    return json({ available: !taken });
}
