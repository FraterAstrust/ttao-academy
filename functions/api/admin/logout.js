/**
 * POST /api/admin/logout
 * Clears the httpOnly admin cookie server-side.
 */
import { requireAdmin, json, cookieHeader } from '../../_shared/utils.js';

export async function onRequestPost({ request, env }) {
    // Still verify admin before clearing — belt-and-suspenders
    const admin = await requireAdmin(request, env);
    if (!admin) return json({ error: 'Unauthorized' }, 401);

    return json({ ok: true }, 200, {
        'Set-Cookie': cookieHeader('ttao_admin', '', {
            maxAge:   0,
            secure:   true,
            httpOnly: true,
            sameSite: 'Strict',
        }),
    });
}
