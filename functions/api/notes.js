/**
 * /api/notes
 * Private, per-student note-taking. Never visible to anyone but the owner —
 * not even admins. A note can be freeform (contentId/contentType omitted)
 * or attached to a specific article/lesson/lab.
 *
 * GET    /api/notes                 → all of the caller's notes, newest first
 * GET    /api/notes?contentId=X     → the caller's notes attached to X
 * POST   /api/notes                 → { contentId?, contentType?, contentTitle?, title?, body }
 * PUT    /api/notes?id=X            → { title?, body? }
 * DELETE /api/notes?id=X
 */
import { requireSession, json } from '../_shared/utils.js';

function mapNote(row) {
    return {
        id:           row.id,
        contentId:    row.content_id,
        contentType:  row.content_type,
        contentTitle: row.content_title,
        title:        row.title,
        body:         row.body,
        createdAt:    row.created_at,
        updatedAt:    row.updated_at,
    };
}

export async function onRequest({ request, env }) {
    const session = await requireSession(request, env);
    if (!session) return json({ error: 'Unauthorized' }, 401);

    const url    = new URL(request.url);
    const id     = url.searchParams.get('id');
    const method = request.method;

    try {
        if (method === 'GET') {
            const contentId = url.searchParams.get('contentId');
            const rows = contentId
                ? await env.DB
                    .prepare('SELECT * FROM notes WHERE user_id = ? AND content_id = ? ORDER BY updated_at DESC')
                    .bind(session.userId, contentId).all()
                : await env.DB
                    .prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC')
                    .bind(session.userId).all();
            return json((rows.results || rows).map(mapNote));
        }

        if (method === 'POST') {
            const body     = await request.json();
            const noteBody = (body.body || '').trim();
            if (!noteBody) return json({ error: 'Note body is required.' }, 400);

            const newId = crypto.randomUUID();
            const now   = new Date().toISOString();
            await env.DB.prepare(
                `INSERT INTO notes (id, user_id, content_id, content_type, content_title, title, body, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                newId, session.userId,
                body.contentId || null, body.contentType || null, body.contentTitle || null,
                (body.title || '').trim() || null, noteBody, now, now
            ).run();

            const row = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(newId).first();
            return json(mapNote(row), 201);
        }

        if (method === 'PUT') {
            if (!id) return json({ error: 'id required' }, 400);
            const existing = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
            if (!existing || existing.user_id !== session.userId) return json({ error: 'Not found' }, 404);

            const body     = await request.json();
            const noteBody = body.body !== undefined ? body.body.trim() : existing.body;
            if (!noteBody) return json({ error: 'Note body is required.' }, 400);

            await env.DB.prepare(
                'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?'
            ).bind(
                body.title !== undefined ? ((body.title || '').trim() || null) : existing.title,
                noteBody, new Date().toISOString(), id
            ).run();

            const row = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
            return json(mapNote(row));
        }

        if (method === 'DELETE') {
            if (!id) return json({ error: 'id required' }, 400);
            const existing = await env.DB.prepare('SELECT user_id FROM notes WHERE id = ?').bind(id).first();
            if (!existing || existing.user_id !== session.userId) return json({ error: 'Not found' }, 404);
            await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
            return json({ deleted: id });
        }

        return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
        console.error('api/notes error:', err);
        return json({ error: err.message }, 500);
    }
}
