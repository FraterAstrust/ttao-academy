/**
 * functions/auth/_middleware.js
 *
 * Runs before every request under /auth/* (patreon, admin, and their callbacks).
 * Limits each IP to LIMIT requests per 60-second window using Cloudflare KV.
 *
 * KV binding: RATE_LIMIT_KV  (add to wrangler.toml and Cloudflare Pages dashboard)
 * KV keys:    rl:{ip}:{minute}  — TTL 120s so old entries self-expire.
 *
 * Fails open: if the KV store is unavailable the request is passed through
 * rather than blocking legitimate traffic.
 */

const LIMIT = 10;

export async function onRequest({ request, env, next }) {
    const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';
    const win = Math.floor(Date.now() / 60000);
    const key = `rl:${ip}:${win}`;

    try {
        const kv      = env.RATE_LIMIT_KV;
        const current = parseInt((await kv.get(key)) || '0', 10);

        if (current >= LIMIT) {
            return new Response(
                JSON.stringify({ error: 'Too many requests — please wait a moment.' }),
                {
                    status:  429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After':  '60',
                    },
                }
            );
        }

        // expirationTtl=120 lets Cloudflare KV auto-delete old window keys.
        await kv.put(key, String(current + 1), { expirationTtl: 120 });
    } catch (e) {
        // Fail open — a rate-limit store error must never break auth.
        console.error('rate-limit error:', e);
    }

    return next();
}
