/**
 * /api/admin/comments
 * Moderation surface for both public discussion and private feedback threads.
 *
 * GET    /api/admin/comments?kind=&contentId=   → recent comments (newest first, max 300)
 * POST   /api/admin/comments                    → admin reply into a private thread
 *          body: { contentId, contentType, threadUserId, body, parentId? }
 * PUT    /api/admin/comments?id=X                → { hidden: true|false }
 * DELETE /api/admin/comments?id=X                → hard delete
 */
import { requireAdmin, json } from '../../_shared/utils.js';

function mapComment(row) {
    return {
        id:           row.id,
        contentId:    row.content_id,
        contentType:  row.content_type,
        kind:         row.kind,
        threadUserId: row.thread_user_id,
        authorId:     row.author_id,
        authorName:   row.author_name,
        isAdminReply: row.is_admin_reply === 1,
        parentId:     row.parent_id,
        body:         row.body,
        createdAt:    row.created_at,
        deletedAt:    row.deleted_at,
        hidden:       row.hidden === 1,
    };
}

export async function onRequest({ request, env }) {
    const admin = await requireAdmin(request, env);
    if (!admin) return json({ error: 'Unauthorized' }, 401);

    const url       = new URL(request.url);
    const id        = url.searchParams.get('id');
    const kind      = url.searchParams.get('kind');       // 'public' | 'private'
    const contentId = url.searchParams.get('contentId');
    const method    = request.method;

    try {
        if (method === 'GET') {
            let sql = 'SELECT * FROM comments WHERE 1=1';
            const params = [];
            if (kind)      { sql += ' AND kind = ?';       params.push(kind); }
            if (contentId) { sql += ' AND content_id = ?'; params.push(contentId); }
            sql += ' ORDER BY created_at DESC LIMIT 300';

            const rows = await env.DB.prepare(sql).bind(...params).all();
            return json((rows.results || rows).map(mapComment));
        }

        if (method === 'POST') {
            // Admin replying inside a student's private feedback thread.
            const body = await request.json();
            const text = (body.body || '').trim();
            if (!body.contentId)    return json({ error: 'contentId required' }, 400);
            if (!body.threadUserId) return json({ error: 'threadUserId required' }, 400);
            if (!text)              return json({ error: 'Reply body is required.' }, 400);

            const newId = crypto.randomUUID();
            const now   = new Date().toISOString();

            await env.DB.prepare(
                `INSERT INTO comments
                    (id, content_id, content_type, kind, thread_user_id, author_id, author_name,
                     is_admin_reply, parent_id, body, created_at, updated_at)
                 VALUES (?, ?, ?, 'private', ?, ?, ?, 1, ?, ?, ?, ?)`
            ).bind(
                newId, body.contentId, body.contentType || 'articles', body.threadUserId,
                admin.userId, admin.name || 'Frater Astrust',
                body.parentId || null, text, now, now
            ).run();

            const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(newId).first();
            return json(mapComment(row), 201);
        }

        if (method === 'PUT') {
            if (!id) return json({ error: 'id required' }, 400);
            const existing = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
            if (!existing) return json({ error: 'Not found' }, 404);

            const body = await request.json();
            if (body.hidden === undefined) return json({ error: 'hidden required' }, 400);

            await env.DB.prepare('UPDATE comments SET hidden = ? WHERE id = ?')
                .bind(body.hidden ? 1 : 0, id).run();

            const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
            return json(mapComment(row));
        }

        if (method === 'DELETE') {
            if (!id) return json({ error: 'id required' }, 400);
            await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
            return json({ deleted: id });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('api/admin/comments error:', err);
        return json({ error: err.message }, 500);
    }
}
