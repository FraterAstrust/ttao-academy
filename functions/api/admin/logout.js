/**
 * POST /api/admin/logout
 * Clears the httpOnly admin cookie.
 */
import { requireAdmin, cookieHeader, json } from '../../_shared/utils.js';

export async function onRequestPost({ request, env }) {
    const admin = await requireAdmin(request, env);
    if (!admin) return json({ error: 'Unauthorized' }, 401);

    return json({ ok: true }, 200, {
        'Set-Cookie': cookieHeader('ttao_admin', '', {
            maxAge: 0, secure: true, httpOnly: true, sameSite: 'Strict',
        }),
    });
}
