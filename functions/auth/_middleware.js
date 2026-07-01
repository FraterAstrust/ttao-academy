/**
 * functions/auth/_middleware.js
 * Rate-limits all /auth/* routes to LIMIT requests per IP per minute.
 * Uses RATE_LIMIT_KV with expirationTtl so old keys self-expire.
 * Fails open — a KV outage never blocks legitimate logins.
 */

const LIMIT = 10;

export async function onRequest({ request, env, next }) {
    const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';
    const win = Math.floor(Date.now() / 60000);
    const key = `rl:auth:${ip}:${win}`;

    try {
        const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
        if (current >= LIMIT) {
            return new Response(
                JSON.stringify({ error: 'Too many requests — please wait a moment.' }),
                {
                    status:  429,
                    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
                }
            );
        }
        await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 120 });
    } catch (e) {
        console.error('rate-limit error:', e);
    }

    return next();
}
