import { requireAdmin, json } from '../../_shared/utils.js';

export async function onRequest({ request, env }) {
    const admin = await requireAdmin(request, env);
    if (!admin) return json({ error: 'Unauthorized' }, 401);

    const url    = new URL(request.url);
    const id     = url.searchParams.get('id');
    const method = request.method;

    try {
        if (method === 'GET') {
            const rows = await env.DB
                .prepare('SELECT id, email, username, tier, tier_override, is_admin, last_seen FROM users')
                .all();

            const students = (rows.results || rows).map(user => ({
                userId:       user.id,
                name:         user.username || '—',
                email:        user.email,
                tier:         user.tier,
                tierOverride: user.tier_override === 1,
                isAdmin:      user.is_admin === 1,
                lastSeen:     user.last_seen,
            }));

            students.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
            return json(students);
        }

        if (method === 'PUT') {
            if (!id) return json({ error: 'id required' }, 400);
            const existing = await env.DB
                .prepare('SELECT id, tier, tier_override, is_admin FROM users WHERE id = ?')
                .bind(id)
                .first();
            if (!existing) return json({ error: 'Not found' }, 404);

            const body = await request.json();
            const updates = [];
            const params = [];

            if (body.tier) {
                updates.push('tier = ?', 'tier_override = 1');
                params.push(body.tier);
            }
            if (body.isAdmin !== undefined) {
                updates.push('is_admin = ?');
                params.push(body.isAdmin ? 1 : 0);
            }
            if (!updates.length) return json({ error: 'Nothing to update' }, 400);

            params.push(id);
            await env.DB
                .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
                .bind(...params)
                .run();

            return json({
                userId:       id,
                tier:         body.tier || existing.tier,
                tierOverride: body.tier ? true : existing.tier_override === 1,
                isAdmin:      body.isAdmin !== undefined ? !!body.isAdmin : existing.is_admin === 1,
            });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('api/admin/students error:', err);
        return json({ error: err.message }, 500);
    }
}
