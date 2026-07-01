/**
 * POST /api/logout
 * Clears the httpOnly session cookie.
 */
import { clearSessionCookie, json } from '../_shared/utils.js';

export async function onRequestPost() {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
