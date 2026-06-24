/**
 * GET /api/admin/me
 * Returns the current admin's identity.
 * Used by admin.html to confirm admin status without reading a JS-accessible cookie.
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
