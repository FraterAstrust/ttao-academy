/**
 * /api/comments
 * Two lanes of discussion per piece of content:
 *   kind: 'public'  → visible to every student who views that content
 *   kind: 'private' → a one-on-one thread between the caller and admins
 *
 * GET    /api/comments?contentId=X&contentType=Y
 *          → { public: [...], private: [...] }  (private = caller's own thread only)
 * POST   /api/comments   → { contentId, contentType, kind, body, parentId? }
 * DELETE /api/comments?id=X   → soft-deletes the caller's own comment
 */
import { requireSession, json } from '../_shared/utils.js';

function mapComment(row, session) {
    return {
        id:           row.id,
        contentId:    row.content_id,
        contentType:  row.content_type,
        kind:         row.kind,
        authorName:   row.author_name,
        isAdminReply: row.is_admin_reply === 1,
        isOwn:        row.author_id === session.userId,
        parentId:     row.parent_id,
        body:         row.body,
        createdAt:    row.created_at,
    };
}

export async function onRequest({ request, env }) {
    const session = await requireSession(request, env);
    if (!session) return json({ error: 'Unauthorized' }, 401);

    const url         = new URL(request.url);
    const id          = url.searchParams.get('id');
    const contentId   = url.searchParams.get('contentId');
    const contentType = url.searchParams.get('contentType') || 'articles';
    const method      = request.method;

    try {
        if (method === 'GET') {
            if (!contentId) return json({ error: 'contentId required' }, 400);

            const publicRows = await env.DB.prepare(
                `SELECT * FROM comments
                 WHERE content_id = ? AND kind = 'public' AND deleted_at IS NULL AND hidden = 0
                 ORDER BY created_at ASC`
            ).bind(contentId).all();

            const privateRows = await env.DB.prepare(
                `SELECT * FROM comments
                 WHERE content_id = ? AND kind = 'private' AND thread_user_id = ? AND deleted_at IS NULL
                 ORDER BY created_at ASC`
            ).bind(contentId, session.userId).all();

            return json({
                public:  (publicRows.results  || publicRows).map(r => mapComment(r, session)),
                private: (privateRows.results || privateRows).map(r => mapComment(r, session)),
            });
        }

        if (method === 'POST') {
            const body = await request.json();
            const text = (body.body || '').trim();
            const kind = body.kind === 'private' ? 'private' : 'public';
            if (!body.contentId) return json({ error: 'contentId required' }, 400);
            if (!text)           return json({ error: 'Comment body is required.' }, 400);

            const newId       = crypto.randomUUID();
            const now         = new Date().toISOString();
            const authorName  = session.username || session.name || 'Student';

            await env.DB.prepare(
                `INSERT INTO comments
                    (id, content_id, content_type, kind, thread_user_id, author_id, author_name,
                     is_admin_reply, parent_id, body, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
            ).bind(
                newId, body.contentId, body.contentType || contentType, kind,
                session.userId, session.userId, authorName,
                body.parentId || null, text, now, now
            ).run();

            const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(newId).first();
            return json(mapComment(row, session), 201);
        }

        if (method === 'DELETE') {
            if (!id) return json({ error: 'id required' }, 400);
            const existing = await env.DB.prepare('SELECT author_id FROM comments WHERE id = ?').bind(id).first();
            if (!existing || existing.author_id !== session.userId) return json({ error: 'Not found' }, 404);
            await env.DB.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?')
                .bind(new Date().toISOString(), id).run();
            return json({ deleted: id });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('api/comments error:', err);
        return json({ error: err.message }, 500);
    }
}
