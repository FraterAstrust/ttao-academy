/**
 * GET /api/admin/me
 * Returns admin identity. Used by admin.html instead of reading the
 * httpOnly cookie directly from JS.
 */
import { requireAdmin, json } from '../../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    const admin = await requireAdmin(request, env);
    if (!admin) return json({ error: 'Unauthorized' }, 401);

    return json({
        userId: admin.userId,
        name:   admin.name,
        email:  admin.email,
        role:   admin.role,
    });
}
