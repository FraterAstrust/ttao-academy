/**
 * POST /api/logout
 * Clears the httpOnly session cookie.
 * The browser cannot clear httpOnly cookies via document.cookie,
 * so we need a server endpoint to do it.
 */
import { json, cookieHeader } from '../_shared/utils.js';

export async function onRequestPost() {
    return json({ ok: true }, 200, {
        'Set-Cookie': cookieHeader('ttao_session', '', {
            maxAge:   0,
            secure:   true,
            httpOnly: true,
            sameSite: 'Lax',
        }),
    });
}
