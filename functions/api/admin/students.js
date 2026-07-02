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
                .prepare('SELECT id, email, username, display_name, tier, tier_override, last_seen FROM users')
                .all();

            const students = (rows.results || rows).map(user => ({
                userId:       user.id,
                name:         user.display_name || user.username || '—',
                email:        user.email,
                tier:         user.tier,
                tierOverride: user.tier_override === 1,
                lastSeen:     user.last_seen,
            }));

            students.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
            return json(students);
        }

        if (method === 'PUT') {
            if (!id) return json({ error: 'id required' }, 400);
            const existing = await env.DB
                .prepare('SELECT id, tier, tier_override FROM users WHERE id = ?')
                .bind(id)
                .first();
            if (!existing) return json({ error: 'Not found' }, 404);

            const { tier } = await request.json();
            await env.DB
                .prepare('UPDATE users SET tier = ?, tier_override = 1 WHERE id = ?')
                .bind(tier, id)
                .run();

            return json({
                userId:       id,
                tier,
                tierOverride: true,
            });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('api/admin/students error:', err);
        return json({ error: err.message }, 500);
    }
}
